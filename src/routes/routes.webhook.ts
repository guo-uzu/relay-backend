import express, { type Request, type Response, type Router } from "express";
import z from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { history, sheet } from "../db/app.schema.ts";
import { SheetChangesPayload } from "../lib/validations.ts";
import { toHistoryRows } from "../lib/webhookEvents.ts";

const routerWebhook: Router = express.Router();

/*
  Called by the Google Apps Script installed in the spreadsheet.
  shortcut: the endpoint is open for the MVP because the sheet is an internal
  document; add a secret or a per-connection token before sharing it outside.
*/
routerWebhook.post("/updates", async (req: Request, res: Response) => {
  const result = SheetChangesPayload.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      message: "Invalid payload format",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  const payload = result.data;
  // shortcut: first matching connection wins; disambiguate with a token if two
  // organizations ever connect the same tab
  const [connection] = await db
    .select({ id: sheet.id, organizationId: sheet.organizationId })
    .from(sheet)
    .where(
      and(
        eq(sheet.sheetId, payload.spreadsheetId),
        eq(sheet.googleTabId, payload.tabId),
      ),
    )
    .limit(1);

  if (!connection) {
    return res.status(404).json({ message: "Sheet connection not found" });
  }

  const rows = toHistoryRows(payload, connection);
  // a batch of only "modified" changes with an empty `changed` maps to no rows,
  // and drizzle throws on .values([])
  if (rows.length === 0) {
    return res.status(200).json({ message: "Nothing to record", accepted: 0 });
  }

  try {
    // one multi-row INSERT: the whole batch is stored or none of it, so the
    // script's retry (it keeps its snapshot on error) never re-sends half a batch
    const inserted = await db
      .insert(history)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: history.id });

    return res.status(200).json({
      message: "Webhook processed successfully",
      accepted: inserted.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error processing webhook" });
  }
});

export { routerWebhook };
