import express, { type Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { ImportSheetBody, SetSheetId, TestSheetId } from "../lib/validations.ts";
import z from "zod";
import { db } from "../db/index.ts";
import { history, sheet } from "../db/app.schema.ts";
import { validateUserOrgRole } from "../lib/validate.user.org.ts";
import type { User } from "better-auth";
import { eq, and } from "drizzle-orm";
import { getTabRows, getTabs } from "../services/googleSheets.service.ts";
import { parseSheetRows, SheetImportError} from "../lib/sheetImport.ts";
import { listSheets } from "../lib/sheetsList.ts";
const routerSheets: Router = express.Router();
const ORGANIZATION_ROLES = ["admin", "owner"];
const MEMBER_ROLES = [...ORGANIZATION_ROLES, "member"];

/*
  @param :id is the id of the organization
*/

routerSheets.get("/:id/sheets", async (req: Request, res: Response) => {
  const organizationId = req.params.id as string;
  const user = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, user.id, MEMBER_ROLES)))
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });

  return res.json(await listSheets(organizationId));
});

routerSheets.post("/:id/test-sheet", async (req: Request, res: Response) => {
  const result = TestSheetId.safeParse(req.body);
  const organizationId = req.params.id as string;

  if (!result.success) {
    return res.status(400).json({
      message: "Incomplete data sended",
      code: "BAD REQUEST"
    });
  }

  const user = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES)))
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });

  try {
    await getTabs(result.data.sheetId);
    return res.json({ message: "Sheet is accessible", data: true });
  } catch {
    return res.json({ message: "Sheet is not accessible", data: false, code: "BAD REQUEST" });
  }
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
    console.log(tab)
    if (!tab) {
      return res.status(404).json({ message: "Tab not found in spreadsheet" });
    }

    const [existing] = await db
      .select({ id: sheet.id, webhookToken: sheet.webhookToken })
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
      // connections created before webhook tokens existed get one on demand
      const webhookToken = existing.webhookToken ?? randomBytes(24).toString("base64url");
      if (!existing.webhookToken) {
        await db.update(sheet).set({ webhookToken }).where(eq(sheet.id, existing.id));
      }
      return res.status(200).json({
        message: "Sheet already registered",
        data: { connectionId: existing.id, spreadsheetId, webhookToken },
      });
    }

    // shortcut: check-then-insert can race and register twice; add a unique (organization_id, sheet_id, google_tab_id) index to close it
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(sheet)
        .values({
          sheetId: spreadsheetId,
          googleTabId: tab.id,
          nameSheet: tab.title,
          organizationId: organizationId,
          userId: user.id,
          webhookToken: randomBytes(24).toString("base64url"),
        })
        .returning({ id: sheet.id, webhookToken: sheet.webhookToken });

      await tx.insert(history).values({
        organizationId,
        userId: user.id,
        sheetId: row!.id,
        eventType: "conectado",
        actorName: user.name,
        actorEmail: user.email,
        source: "relay",
        action: `Conectó la pestaña "${tab.title}"`,
      });

      return row!;
    });

    return res.status(201).json({
      message: "id added",
      data: {
        connectionId: created.id,
        spreadsheetId,
        webhookToken: created.webhookToken,
      },
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
    await db.transaction(async (tx) => {
      await tx
        .update(sheet)
        .set({ nameSheet: tab.title, headers, values, importedAt })
        .where(eq(sheet.id, connection.id));

      await tx.insert(history).values({
        organizationId,
        userId: user.id,
        sheetId: connection.id,
        eventType: "importado",
        actorName: user.name,
        actorEmail: user.email,
        source: "relay",
        action: `Importó ${values.length} filas de la pestaña "${tab.title}"`,
        // the dashboard shows "importó N filas"; keep N out of the text
        rawPayload: { rows: values.length },
      });
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

export { routerSheets };
