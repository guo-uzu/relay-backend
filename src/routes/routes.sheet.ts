import express, { type Router, type Request, type Response } from "express";
import { ImportSheetBody, SetSheetId } from "../lib/validations.ts";
import z from "zod";
import { db } from "../db/index.ts";
import { validateUserOrgRole } from "../lib/validate.user.org.ts";
import type { User } from "better-auth";
import { eq, and, desc } from "drizzle-orm";
import { getTabRows, getTabs } from "../services/googleSheets.service.ts";
import { parseSheetRows, SheetImportError } from "../lib/sheetImport.ts";
import { SheetPayloadSchema } from "../lib/validations.ts";
import { sheet, history } from "../db/app.schema.ts";

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

routerSheets.get("/:id", async (req: Request, res: Response) => {
  const organizationId = req.params.id as string;
  const user = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const sheetsList = await db
      .select({
        id: sheet.id,
        name: sheet.nameSheet,
        importedAt: sheet.importedAt,
        values: sheet.values,
      })
      .from(sheet)
      .where(eq(sheet.organizationId, organizationId));

    const result = sheetsList.map((s) => ({
      id: s.id,
      name: s.name,
      importedAt: s.importedAt ? s.importedAt.toISOString() : null,
      rowCount: Array.isArray(s.values) ? s.values.length : 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error al obtener las hojas:", error);
    return res.status(500).json({ message: "Error fetching sheets" });
  }
});

routerSheets.post("/updates", async (req: Request, res: Response) => {
  console.log(req.body);
  const result = SheetPayloadSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      message: "Invalid payload format",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  console.log(result.data);
  return res.status(200).json({
    message: "Webhook processed successfully",
  });
});

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

    const [created] = await db
      .insert(sheet)
      .values({
        sheetId: spreadsheetId,
        googleTabId: tab.id,
        nameSheet: tab.title,
        organizationId: organizationId,
        userId: user.id,
      })
      .returning({ id: sheet.id });

    // TRACKING: Registro de la conexión en history
    await db.insert(history).values({
      userId: user.id,
      organizationId: organizationId,
      action: `Conectó la pestaña "${tab.title}" de la hoja (${spreadsheetId})`,
    });

    return res.status(201).json({
      message: "id added",
      data: { connectionId: created!.id, spreadsheetId },
    });
  } catch (error) {
    console.error(error);
    return res.status(406).json({ message: "Error uploading the data" });
  }
});

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

  if (!(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES))) {
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

    const importedAt = new Date();
    await db
      .update(sheet)
      .set({ nameSheet: tab.title, headers, values, importedAt })
      .where(eq(sheet.id, connection.id));

    // TRACKING: Registro de la importación en history
    await db.insert(history).values({
      userId: user.id,
      organizationId: organizationId,
      action: `Importó ${values.length} filas en la hoja "${tab.title}"`,
    });

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

routerSheets.get("/:id/:sheetId/rows", async (req: Request, res: Response) => {
  const organizationId = req.params.id as string;
  const sheetRecordId = req.params.sheetId as string;
  const user = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const [sheetData] = await db
      .select({
        name: sheet.nameSheet,
        headers: sheet.headers,
        values: sheet.values,
      })
      .from(sheet)
      .where(
        and(
          eq(sheet.id, sheetRecordId),
          eq(sheet.organizationId, organizationId),
        ),
      );

    if (!sheetData) {
      return res.status(404).json({ message: "Sheet not found" });
    }

    const headers = sheetData.headers ?? [];
    const rawValues = Array.isArray(sheetData.values) ? sheetData.values : [];

    const rows = rawValues.map((row, index) => ({
      n: index + 1,
      cells: row.map((cell) => cell ?? ""),
    }));

    return res.status(200).json({
      sheetName: sheetData.name,
      headers,
      rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("Error al obtener las filas:", error);
    return res.status(500).json({ message: "Error fetching sheet rows" });
  }
});
routerSheets.get("/:id/history", async (req: Request, res: Response) => {
  const organizationId = req.params.id as string;
  const currentUser = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, currentUser.id, ORGANIZATION_ROLES))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const logs = await db
      .select({
        id: history.id,
        action: history.action,
        createdAt: history.createdAt,
      })
      .from(history)
      .where(eq(history.organizationId, organizationId))
      .orderBy(desc(history.createdAt))
      .limit(30);

    return res.status(200).json(logs);
  } catch (error) {
    console.error("Error al obtener historial:", error);
    return res.status(500).json({ message: "Error fetching history" });
  }
});

export { routerSheets };