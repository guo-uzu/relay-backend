// Read-side helpers for the dashboard. Pure (no DB) so the day bucketing and the
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

type SeriesPoint = { date: string } & Record<Action, number>;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f;
}

// The client sends its browser zone; an invalid one must not crash the request.
export function safeTz(value: unknown) {
  const tz = typeof value === "string" && value ? value : "UTC";
  try {
    formatter(tz);
    return tz;
  } catch {
    return "UTC";
  }
}

export const dayKey = (date: Date, tz: string) => formatter(tz).format(date);

// Calendar arithmetic in UTC so a DST change cannot skip or repeat a day.
export function lastDays(count: number, tz: string, now = new Date()) {
  const [y, m, d] = dayKey(now, tz).split("-").map(Number);
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d - (count - 1 - i))).toISOString().slice(0, 10),
  );
}

type Dated = { eventType: string; occurredAt: Date };

export function buildSeries(rows: Dated[], days: string[], tz: string): SeriesPoint[] {
  const index = new Map(days.map((date, i) => [date, i]));
  const series: SeriesPoint[] = days.map((date) => ({
    date,
    added: 0,
    edited: 0,
    deleted: 0,
    imported: 0,
    connected: 0,
  }));

  for (const row of rows) {
    const action = ACTION[row.eventType];
    if (!action) continue;
    const i = index.get(dayKey(row.occurredAt, tz));
    if (i === undefined) continue;
    series[i][action] += 1;
  }

  return series;
}

type ActorRow = { occurredAt: Date; actorEmail: string | null; actorName: string | null };

export function topActors(rows: ActorRow[], days: string[], tz: string, limit = 5) {
  const week = new Set(days.slice(-7));
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (!week.has(dayKey(row.occurredAt, tz))) continue;
    const actor = row.actorEmail ?? row.actorName;
    if (!actor) continue;
    counts.set(actor, (counts.get(actor) ?? 0) + 1);
  }

  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([email, count]) => ({ email, count }));
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
