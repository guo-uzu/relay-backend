import { describe, it, expect } from "vitest";
import { toHistoryEvent, todayCounts } from "../src/lib/dashboard.ts";

describe("todayCounts", () => {
  it("counts the known event types for today", () => {
    expect(
      todayCounts([
        { eventType: "editado", count: "2" },
        { eventType: "importado", count: 1 },
      ]),
    ).toEqual({ added: 0, edited: 2, deleted: 0, imported: 1, connected: 0 });
  });

  it("ignores unknown event types", () => {
    expect(todayCounts([{ eventType: "borrado", count: 5 }])).toEqual({
      added: 0,
      edited: 0,
      deleted: 0,
      imported: 0,
      connected: 0,
    });
  });
});

describe("toHistoryEvent", () => {
  const row = {
    id: "h1",
    eventType: "editado",
    source: "google_sheets",
    actorName: "luis m",
    actorEmail: null as string | null,
    occurredAt: new Date("2026-11-04T18:20:00Z"),
    rowNumber: 14 as number | null,
    columnIndex: 6 as number | null,
    columnName: null as string | null,
    oldValue: "DESPENSA",
    newValue: "SILLA",
    rawPayload: null as unknown,
    sheetName: "21 APOYOS jul/ago",
  };

  it("translates the stored vocabulary and fills missing actor/column", () => {
    expect(toHistoryEvent(row)).toMatchObject({
      action: "edited",
      source: "sheet",
      actor: "luis m",
      row: 14,
      column: "#6",
      old: "DESPENSA",
      new: "SILLA",
      sheetName: "21 APOYOS jul/ago",
    });
    expect(toHistoryEvent(row).at).toBe("2026-11-04T18:20:00.000Z");
  });

  it("reads the imported row count from raw_payload and marks Relay actions", () => {
    const ev = toHistoryEvent({
      ...row,
      eventType: "importado",
      source: "relay",
      rowNumber: null,
      columnIndex: null,
      rawPayload: { rows: 50 },
    });

    expect(ev).toMatchObject({ action: "imported", source: "platform", n: 50 });
  });

  it("never returns a null actor", () => {
    expect(toHistoryEvent({ ...row, actorEmail: null, actorName: null }).actor).toBe(
      "Google",
    );
  });
});
