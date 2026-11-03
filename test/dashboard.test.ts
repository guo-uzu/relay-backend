import { describe, it, expect } from "vitest";
import {
  buildSeries,
  lastDays,
  safeTz,
  toHistoryEvent,
  topActors,
} from "../src/lib/dashboard.ts";

const TZ = "America/Mexico_City";
const INSTANT = new Date("2026-11-03T02:00:00Z"); // 2026-11-02 in Mexico City

describe("safeTz", () => {
  it("keeps valid zones and falls back to UTC", () => {
    expect(safeTz("Europe/Madrid")).toBe("Europe/Madrid");
    expect(safeTz("Nope/Zone")).toBe("UTC");
    expect(safeTz(undefined)).toBe("UTC");
  });
});

describe("lastDays", () => {
  it("returns consecutive days ending on today in the given zone", () => {
    expect(lastDays(3, TZ, INSTANT)).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
});

describe("buildSeries", () => {
  it("fills empty days with zeroes and buckets by the client timezone", () => {
    const days = lastDays(2, TZ, INSTANT);
    const rows = [
      { eventType: "editado", occurredAt: INSTANT },
      { eventType: "importado", occurredAt: new Date("2026-11-01T18:00:00Z") },
      { eventType: "editado", occurredAt: new Date("2026-11-20T00:00:00Z") },
    ];

    expect(buildSeries(rows, days, TZ)).toEqual([
      { date: "2026-11-01", added: 0, edited: 0, deleted: 0, imported: 1, connected: 0 },
      { date: "2026-11-02", added: 0, edited: 1, deleted: 0, imported: 0, connected: 0 },
    ]);
  });

  it("puts the same instant on a different day for another zone", () => {
    const days = lastDays(1, "Europe/Madrid", INSTANT);
    const series = buildSeries(
      [{ eventType: "agregado", occurredAt: INSTANT }],
      days,
      "Europe/Madrid",
    );

    expect(days).toEqual(["2026-11-03"]);
    expect(series[0].added).toBe(1);
  });

  it("ignores unknown stored event types", () => {
    const days = lastDays(1, TZ, INSTANT);
    const series = buildSeries([{ eventType: "borrado", occurredAt: INSTANT }], days, TZ);
    expect(series[0]).toMatchObject({ added: 0, edited: 0, deleted: 0, imported: 0, connected: 0 });
  });
});

describe("topActors", () => {
  it("counts only the last 7 days and sorts by count", () => {
    const days = lastDays(30, TZ, new Date("2026-11-03T20:00:00Z"));
    const rows = [
      { actorEmail: "a@x.com", actorName: null, occurredAt: new Date("2026-11-03T15:00:00Z") },
      { actorEmail: "a@x.com", actorName: null, occurredAt: new Date("2026-11-02T15:00:00Z") },
      { actorEmail: "b@x.com", actorName: null, occurredAt: new Date("2026-11-01T15:00:00Z") },
      { actorEmail: "old@x.com", actorName: null, occurredAt: new Date("2026-09-01T15:00:00Z") },
    ];

    expect(topActors(rows, days, TZ)).toEqual([
      { email: "a@x.com", count: 2 },
      { email: "b@x.com", count: 1 },
    ]);
  });
});

describe("toHistoryEvent", () => {
  const row = {
    id: "h1",
    eventType: "editado",
    source: "google_sheets",
    actorName: "luis m",
    actorEmail: null as string | null,
    occurredAt: new Date("2026-11-03T18:20:00Z"),
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
    expect(toHistoryEvent(row).at).toBe("2026-11-03T18:20:00.000Z");
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
    const ev = toHistoryEvent({ ...row, actorEmail: null, actorName: null });
    expect(ev.actor).toBe("Google");
  });
});
