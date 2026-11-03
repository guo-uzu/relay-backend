import express, { type Request, type Response, type Router } from "express";
import z from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { history, sheet } from "../db/app.schema.ts";
import { WebhookPayload } from "../lib/validations.ts";
import { toHistoryRow } from "../lib/webhookEvents.ts";

const routerWebhook: Router = express.Router();

/*
  Called by the Google Apps Script installed in the spreadsheet.
  The per-connection token in X-Webhook-Token authenticates the call and tells
  us which connection (and therefore which organization) the events belong to.
*/
routerWebhook.post("/updates", async (req: Request, res: Response) => {
  const token = req.header("x-webhook-token");
  if (!token) {
    return res.status(401).json({ message: "Missing webhook token" });
  }

  const [connection] = await db
    .select({
      id: sheet.id,
      organizationId: sheet.organizationId,
      spreadsheetId: sheet.sheetId,
      googleTabId: sheet.googleTabId,
    })
    .from(sheet)
    .where(eq(sheet.webhookToken, token))
    .limit(1);

  if (!connection) {
    return res.status(401).json({ message: "Invalid webhook token" });
  }

  const result = WebhookPayload.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      message: "Invalid payload format",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  const payload = result.data;
  if (
    payload.spreadsheetId !== connection.spreadsheetId ||
    (connection.googleTabId !== null && payload.tabId !== connection.googleTabId)
  ) {
    return res.status(400).json({ message: "Payload does not match the connection" });
  }

  try {
    const inserted = await db
      .insert(history)
      .values(payload.events.map((event) => toHistoryRow(event, connection)))
      .onConflictDoNothing()
      .returning({ id: history.id });

    return res.status(200).json({
      message: "Webhook processed successfully",
      accepted: inserted.length,
      duplicates: payload.events.length - inserted.length,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error processing webhook" });
  }
});

export { routerWebhook };
