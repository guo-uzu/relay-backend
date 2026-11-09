import type { history } from "../db/app.schema.ts";
import type { SheetChangesPayload } from "./validations.ts";

// shape accepted by db.insert(history); type-only import, so this file stays DB-free
type HistoryInsert = typeof history.$inferInsert;

type Connection = {
  id: string;
  organizationId: string;
};

// script vocabulary -> stored vocabulary (dashboard.ts only knows the Spanish keys)
const EVENT_TYPE = {
  added: "agregado",
  modified: "editado",
  deleted: "eliminado",
} as const;

// Pure mapping so the payload contract can be tested without DB or network.
// One history row per added / deleted row, and one per changed column of a
// modified row (history stores a single cell change per row).
export function toHistoryRows(
  payload: SheetChangesPayload,
  connection: Connection,
): HistoryInsert[] {
  const { meta } = payload;

  // fields shared by every row of this batch
  const base = {
    // the org always comes from the resolved connection, never from the payload
    organizationId: connection.organizationId,
    sheetId: connection.id,
    actorName: null,
    // the script sends "unknown" when Google does not expose the editor's email
    actorEmail: meta.user === "unknown" ? null : meta.user,
    source: "google_sheets",
    occurredAt: new Date(meta.at),
    // the script does not send column positions, only header names
    columnIndex: null,
    // shortcut: retries may duplicate events; add a deterministic id later
    externalId: null,
  };

  // <HistoryInsert> tells TS both branches build the same row shape; otherwise it
  // infers the type from the first branch and rejects the second one
  return payload.changes.flatMap<HistoryInsert>((change) => {
    if (change.type === "modified") {
      return Object.entries(change.changed ?? {}).map(([column, { from, to }]) => ({
        ...base,
        eventType: EVENT_TYPE.modified,
        rowNumber: change.row,
        columnName: column,
        oldValue: from,
        newValue: to,
        rawPayload: change,
      }));
    }

    // whole-row events: keep a readable summary of the row's values
    const summary = Object.values(change.data).filter(Boolean).join(", ") || null;
    return [{
      ...base,
      eventType: EVENT_TYPE[change.type],
      rowNumber: change.row,
      columnName: null,
      oldValue: change.type === "deleted" ? summary : null,
      newValue: change.type === "added" ? summary : null,
      rawPayload: change,
    }];
  });
}
