import express, { type Router, type Request, type Response } from "express";
import { ImportSheetBody, SetSheetId } from "../lib/validations.ts";
import z from "zod";
import { db } from "../db/index.ts";
import { sheet } from "../db/app.schema.ts";
import { validateUserOrgRole } from "../lib/validate.user.org.ts";
import type { User } from "better-auth";
import { eq, and } from "drizzle-orm";
import { getTabRows, getTabs } from "../services/googleSheets.service.ts";
import { parseSheetRows, SheetImportError } from "../lib/sheetImport.ts";

const routerSheets: Router = express.Router();
const ORGANIZATION_ROLES = ["admin", "owner"];

// Interfaz para el JSON de respuesta del Webhook
export interface LogEntry {
  id: string;
  user: string;
  trigger: string;
  timestamp: string;
  row: number;
  column: string;
  modification: {
    old: unknown;
    new: unknown;
  } | unknown;
}

/*
  @param :id is the id of the organization
*/

// ==========================================
// NUEVO WEBHOOK: Recibe los cambios desde Google Apps Script
// ==========================================
routerSheets.post("/webhook/log", async (req: Request, res: Response) => {
  const result = SheetPayloadSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: "Invalid payload format",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  const { meta, changes } = result.data as SheetPayload;
  const logs: LogEntry[] = [];

  changes.forEach((change: SheetChangeItem) => {
    if (change.changed && Object.keys(change.changed).length > 0) {
      for (const [column, diff] of Object.entries(change.changed)) {
        const isDiffObject =
          typeof diff === 'object' && diff !== null && ('old' in diff || 'new' in diff);

        logs.push({
          id: change.id,
          user: meta.user,
          trigger: meta.trigger,
          timestamp: meta.at,
          row: change.row,
          column,
          modification: isDiffObject
            ? {
                old: (diff as { old?: unknown }).old ?? null,
                new: (diff as { new?: unknown }).new ?? null
              }
            : diff
        });
      }
    } else {
      logs.push({
        id: change.id,
        user: meta.user,
        trigger: meta.trigger,
        timestamp: meta.at,
        row: change.row,
        column: 'N/A',
        modification: change.data
      });
    }
  });

  // Log en consola para verificar qué está llegando
  console.log(JSON.stringify(logs, null, 2));

  // TODO: Si necesitas guardar los cambios en la base de datos, 
  // aquí deberías hacer el db.insert().values() correspondiente a tu tabla de logs.

  return res.status(200).json({
    message: "Webhook processed successfully",
    total: logs.length,
    data: logs
  });
});

// ==========================================
// RUTAS EXISTENTES
// ==========================================
routerSheets.post("/:id/set-sheet-id", async (req: Request, res: Response) => {
  const result = SetSheetId.safeParse(req.body);
  const organizationId = req.params.id as string;

  if (!result.success) {
    return res.status(400).json({
      message: "Incomplete data sended",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  const user = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES)))
    return res.status(403).json({ message: "Forbidden" });
  const spreadsheetId = result.data.sheetId;
  const spreadsheetName = result.data.nameSheet;
  try {
    const tab = (await getTabs(spreadsheetId)).find(
      (t) => t.title === spreadsheetName,
    );
    console.log(tab)
    if (!tab) {
      return res.status(404).json({ message: "Tab not found in spreadsheet" });
    }

    const [existing] = await db
      .select({ id: sheet.id })
      .from(sheet)
      .where(
        and(
          eq(sheet.organizationId, organizationId),
          eq(sheet.sheetId, spreadsheetId),
          eq(sheet.googleTabId, tab.id),
        ),
      )
      .limit(1);

    if (existing) {
      return res.status(200).json({
        message: "Sheet already registered",
        data: { connectionId: existing.id, spreadsheetId },
      });
    }

    // shortcut: check-then-insert can race and register twice; add a unique (organization_id, sheet_id, google_tab_id) index to close it
    const [created] = await db
      .insert(sheet)
      .values({
        sheetId: spreadsheetId,
        googleTabId: tab.id,
        name: tab.title,
        organizationId: organizationId,
        userId: user.id,
      })
      .returning({ id: sheet.id });

    return res.status(201).json({
      message: "id added",
      data: { connectionId: created!.id, spreadsheetId },
    });
  } catch (error) {
    console.error(error);
    return res.status(406).json({ message: "Error uploading the data" });
  }
});

/*
@deprecated
*/
routerSheets.post("/:id/import-sheet", async (req: Request, res: Response) => {
  const result = ImportSheetBody.safeParse(req.body);
  const organizationId = req.params.id as string;
  const user = res.locals.user as User;

  if (!result.success) {
    return res.status(400).json({
      message: "Incomplete data sended",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  if (
    !(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES))
  ) {
    return res.status(403).json({
      message: "Forbidden",
    });
  }

  try {
    const [connection] = await db
      .select({
        id: sheet.id,
        sheetId: sheet.sheetId,
        googleTabId: sheet.googleTabId,
      })
      .from(sheet)
      .where(
        and(
          eq(sheet.id, result.data.connectionId),
          eq(sheet.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!connection) {
      return res.status(404).json({ message: "Sheet connection not found" });
    }
    if (connection.googleTabId === null) {
      return res
        .status(409)
        .json({
          message: "Connection has no tab id, register the sheet again",
        });
    }

    const tab = (await getTabs(connection.sheetId)).find(
      (t) => t.id === connection.googleTabId,
    );
    if (!tab) {
      return res.status(404).json({ message: "Tab not found in spreadsheet" });
    }

    const { headers, values } = parseSheetRows(
      await getTabRows(connection.sheetId, tab.title),
    );

    // one UPDATE is atomic: any earlier failure leaves the previous snapshot untouched
    const importedAt = new Date();
    await db
      .update(sheet)
      .set({ name: tab.title, headers, values, importedAt })
      .where(eq(sheet.id, connection.id));

    return res.status(200).json({
      message: "Sheet imported",
      data: { rows: values.length, importedAt },
    });
  } catch (error) {
    if (error instanceof SheetImportError) {
      return res.status(422).json({ message: error.message });
    }
    console.error(error);
    return res.status(500).json({ message: "Error importing sheet" });
  }
});

export { routerSheets };