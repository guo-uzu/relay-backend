import express, { type Request, type Response, type Router } from "express";
import z from "zod";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "../lib/auth.ts";
import { db } from "../db/index.ts";
import { history, sheet } from "../db/app.schema.ts";
import { SheetChangesPayload } from "../lib/validations.ts";
import { toHistoryRows, toSheetOps } from "../lib/webhookEvents.ts";

const routerWebhook: Router = express.Router();

// jsonb containment value that matches the row whose cells hold this id (uses the GIN index)
const idCell = (id: string) => JSON.stringify([{ cells: [id] }]);

/*
  Called by the Google Apps Script installed in the spreadsheet.
  Authenticated with an organization API key sent in the `x-api-key` header.
  The organization comes from the key (server-side), never from the request body.
*/
routerWebhook.post("/updates", async (req: Request, res: Response) => {
  const apiKey = req.get("x-api-key");
  if (!apiKey) {
    return res.status(401).json({ message: "Missing API key" });
  }

  // hashes the key, looks it up, and checks enabled / expiry
  const verified = await auth.api.verifyApiKey({ body: { key: apiKey } });
  if (!verified.valid || !verified.key) {
    return res.status(401).json({ message: "Invalid API key" });
  }
  // references: "organization", so referenceId is the owning organization's id
  const organizationId = verified.key.referenceId;
  // optional scope: the key may be limited to a single sheet connection
  const scopedSheetId =
    typeof verified.key.metadata?.sheetId === "string" ? verified.key.metadata.sheetId : null;

  const result = SheetChangesPayload.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      message: "Invalid payload format",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  const payload = result.data;
  // scoped to the key's organization: two orgs connecting the same tab can't collide, and a key
  // can never reach another org's sheet. and() ignores the undefined when the key isn't scoped.
  const [connection] = await db
    .select({ id: sheet.id, organizationId: sheet.organizationId })
    .from(sheet)
    .where(
      and(
        eq(sheet.organizationId, organizationId),
        eq(sheet.sheetId, payload.spreadsheetId),
        eq(sheet.googleTabId, payload.tabId),
        scopedSheetId ? eq(sheet.id, scopedSheetId) : undefined,
      ),
    )
    .limit(1);

  if (!connection) {
    return res.status(404).json({ message: "Sheet connection not found" });
  }

  const rows = toHistoryRows(payload, connection);
  console.log(rows)
  const ops = toSheetOps(payload);
  // a modified change with an empty `changed` has no history rows but may still carry data
  if (rows.length === 0 && ops.length === 0) {
    return res.status(200).json({ message: "Nothing to record", accepted: 0 });
  }

  try {
    // one transaction: the data and the history are stored together or not at all,
    // so the script's retry (it keeps its snapshot on error) never re-sends half a batch
    const inserted = await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ headers: sheet.headers })
        .from(sheet)
        .where(eq(sheet.id, connection.id))
        .for("update");

      // kept in JS so an "add" after a header op in the same batch sees the new column
      let headers = current?.headers ?? [];
      // cells are positional: they follow the current headers, and _id holds the row id
      const cellsFor = (id: string, data: Record<string, string>) =>
        headers.map((h) => (h.name === "_id" ? id : (data[h.name] ?? "")));

      for (const op of ops) {
        switch (op.kind) {
          case "header": {
            if (op.from === null) {
              headers = [...headers, { name: op.to, obligatory: true }];
              await tx
                .update(sheet)
                .set({
                  headers: sql`coalesce(${sheet.headers}, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('name', ${op.to}::text, 'obligatory', true))`,
                })
                .where(eq(sheet.id, connection.id));
            } else {
              headers = headers.map((h) =>
                h.name === op.from ? { ...h, name: op.to } : h,
              );
              await tx
                .update(sheet)
                .set({
                  headers: sql`(select jsonb_agg(case when h->>'name' = ${op.from} then jsonb_set(h, '{name}', to_jsonb(${op.to}::text)) else h end order by ord) from jsonb_array_elements(coalesce(${sheet.headers}, '[]'::jsonb)) with ordinality as t(h, ord))`,
                })
                .where(eq(sheet.id, connection.id));
            }
            break;
          }

          case "add": {
            const cells = cellsFor(op.id, op.data);
            await tx
              .update(sheet)
              .set({
                values: sql`coalesce(${sheet.values}, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
                  'n',
                  (
                    select coalesce(max((entry->>'n')::int), 0) + 1
                    from jsonb_array_elements(coalesce(${sheet.values}, '[]'::jsonb)) as entry
                  ),
                  'cells',
                  ${JSON.stringify(cells)}::jsonb
                ))`,
                rowCount: sql`${sheet.rowCount} + 1`,
              })
              // NOT ( ... ) with coalesce: a NULL values column would make the check NULL and skip the add
              .where(
                and(
                  eq(sheet.id, connection.id),
                  sql`not (coalesce(${sheet.values}, '[]'::jsonb) @> ${idCell(op.id)}::jsonb)`,
                ),
              );
            break;
          }

          case "edit": {
            const cells = cellsFor(op.id, op.data);
            await tx
              .update(sheet)
              .set({
                values: sql`(select jsonb_agg(case when e->'cells' ? ${op.id}::text then jsonb_set(e, '{cells}', ${JSON.stringify(cells)}::jsonb) else e end order by ord) from jsonb_array_elements(${sheet.values}) with ordinality as t(e, ord))`,
              })
              .where(
                and(
                  eq(sheet.id, connection.id),
                  sql`${sheet.values} @> ${idCell(op.id)}::jsonb`,
                ),
              );
            break;
          }

          case "delete": {
            await tx
              .update(sheet)
              .set({
                values: sql`(select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) from jsonb_array_elements(${sheet.values}) with ordinality as t(e, ord) where not (e->'cells' ? ${op.id}::text))`,
                rowCount: sql`greatest(${sheet.rowCount} - 1, 0)`,
              })
              .where(
                and(
                  eq(sheet.id, connection.id),
                  sql`${sheet.values} @> ${idCell(op.id)}::jsonb`,
                ),
              );
            break;
          }
        }
      }

      // drizzle throws on .values([]), and a header-only batch has no history rows
      if (rows.length === 0) return [];
      return tx
        .insert(history)
        .values(rows)
        .onConflictDoNothing()
        .returning({ id: history.id });
    });

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
