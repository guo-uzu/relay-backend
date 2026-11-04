import { describe, it, expect } from "vitest";
import { toHistoryRow } from "../src/lib/webhookEvents.ts";
import { WebhookPayload } from "../src/lib/validations.ts";

const connection = { id: "conn_1", organizationId: "org_1" };
const event = {
  externalId: "sheet_1:7:14:6:2026-11-03T18:20:00.123Z",
  type: "editado" as const,
  actorName: "luis m",
  actorEmail: "luis@ejemplo.com",
  rowNumber: 14,
  columnIndex: 6,
  columnName: "Tipo de apoyo",
  oldValue: "DESPENSA",
  newValue: "SILLA DE RUEDAS",
  occurredAt: "2026-11-03T18:20:00.123Z",
};

describe("toHistoryRow", () => {
  it("maps a cell edit onto history fields", () => {
    const row = toHistoryRow(event, connection);

    expect(row).toMatchObject({
      organizationId: "org_1",
      sheetId: "conn_1",
      eventType: "editado",
      actorName: "luis m",
      rowNumber: 14,
      columnIndex: 6,
      columnName: "Tipo de apoyo",
      oldValue: "DESPENSA",
      newValue: "SILLA DE RUEDAS",
      source: "google_sheets",
      externalId: event.externalId,
    });
    expect(row.occurredAt).toEqual(new Date(event.occurredAt));
    expect(row.rawPayload).toBe(event);
  });

  it("nulls missing cell fields and takes the org from the connection", () => {
    const row = toHistoryRow(
      { externalId: "x", type: "agregado", occurredAt: event.occurredAt },
      connection,
    );

    expect(row.rowNumber).toBeNull();
    expect(row.oldValue).toBeNull();
    expect(row.actorEmail).toBeNull();
    expect(row.organizationId).toBe("org_1");
  });
});

describe("WebhookPayload", () => {
  it("accepts the documented contract", () => {
    const parsed = WebhookPayload.safeParse({
      spreadsheetId: "sheet_1",
      tabId: 7,
      event,
    });

    expect(parsed.success).toBe(true);
  });

  it.each([
    ["unknown event type", { ...event, type: "borrado" }],
    ["non-ISO timestamp", { ...event, occurredAt: "03/11/2026" }],
    ["empty externalId", { ...event, externalId: "" }],
  ])("rejects %s", (_, badEvent) => {
    const parsed = WebhookPayload.safeParse({
      spreadsheetId: "sheet_1",
      tabId: 7,
      event: badEvent,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a missing event", () => {
    const parsed = WebhookPayload.safeParse({
      spreadsheetId: "sheet_1",
      tabId: 7,
    });

    expect(parsed.success).toBe(false);
  });
});
