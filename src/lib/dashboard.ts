// Read-side helpers for the dashboard. Pure (no DB) so the day counts and the
// stored -> API vocabulary translation can be tested without a database.

export type Action = "added" | "edited" | "deleted" | "imported" | "connected";

const ACTION: Record<string, Action> = {
  agregado: "added",
  editado: "edited",
  eliminado: "deleted",
  importado: "imported",
  conectado: "connected",
};

// stored event types we know how to translate; anything else is ignored
export const EVENT_TYPES = Object.keys(ACTION);

type TodayRow = { eventType: string; count: number | string };

export function todayCounts(rows: TodayRow[]) {
  const today: Record<Action, number> = {
    added: 0,
    edited: 0,
    deleted: 0,
    imported: 0,
    connected: 0,
  };

  for (const row of rows) {
    const action = ACTION[row.eventType];
    if (action) today[action] += Number(row.count);
  }

  return today;
}

type HistoryRow = {
  id: string;
  eventType: string;
  source: string;
  actorName: string | null;
  actorEmail: string | null;
  occurredAt: Date;
  rowNumber: number | null;
  columnIndex: number | null;
  columnName: string | null;
  oldValue: string | null;
  newValue: string | null;
  rawPayload: unknown;
  sheetName: string | null;
};

export function toHistoryEvent(row: HistoryRow) {
  const importedRows = row.rawPayload as { rows?: number } | null;

  return {
    id: row.id,
    // the query only selects known event types (EVENT_TYPES)
    action: ACTION[row.eventType]!,
    source: row.source === "relay" ? "platform" : "sheet",
    // the client derives the display name from the email, so it must never be null
    actor: row.actorEmail ?? row.actorName ?? "Google",
    at: row.occurredAt.toISOString(),
    sheetName: row.sheetName ?? "",
    row: row.rowNumber ?? undefined,
    // sheets often have no header row, so fall back to the column number
    column: row.columnName ?? (row.columnIndex ? `#${row.columnIndex}` : undefined),
    old: row.oldValue ?? undefined,
    new: row.newValue ?? undefined,
    n: row.eventType === "importado" ? (importedRows?.rows ?? 0) : undefined,
  };
}
