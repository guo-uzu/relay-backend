import { describe, it, expect } from "vitest";
import { toHistoryRows } from "../src/lib/webhookEvents.ts";
import { SheetChangesPayload } from "../src/lib/validations.ts";

const connection = { id: "conn_1", organizationId: "org_1" };
const meta = {
  at: "2026-11-03T12:20:00-06:00",
  user: "luis@ejemplo.com",
  trigger: "EDIT",
};

const added = {
  type: "added" as const,
  id: "row-a",
  row: 15,
  data: { Nombre: "Ana", "Tipo de apoyo": "DESPENSA", Notas: "" },
};
const modified = {
  type: "modified" as const,
  id: "row-b",
  row: 14,
  data: { Nombre: "Luis", "Tipo de apoyo": "SILLA DE RUEDAS", Notas: "urgente" },
  changed: {
    "Tipo de apoyo": { from: "DESPENSA", to: "SILLA DE RUEDAS" },
    Notas: { from: null, to: "urgente" },
  },
};
const deleted = {
  type: "deleted" as const,
  id: "row-c",
  row: null,
  data: { Nombre: "Beto", "Tipo de apoyo": "DESPENSA" },
};

const payload = {
  spreadsheetId: "sheet_1",
  tabId: 7,
  meta,
  changes: [added, modified, deleted],
};

describe("toHistoryRows", () => {
  it("maps one row per added/deleted change and one per changed column", () => {
    const rows = toHistoryRows(payload, connection);

    expect(rows.map((r) => [r.eventType, r.columnName])).toEqual([
      ["agregado", null],
      ["editado", "Tipo de apoyo"],
      ["editado", "Notas"],
      ["eliminado", null],
    ]);
  });

  it("maps a column edit onto history fields", () => {
    const [, edit] = toHistoryRows(payload, connection);

    expect(edit).toMatchObject({
      organizationId: "org_1",
      sheetId: "conn_1",
      eventType: "editado",
      actorEmail: "luis@ejemplo.com",
      rowNumber: 14,
      columnName: "Tipo de apoyo",
      oldValue: "DESPENSA",
      newValue: "SILLA DE RUEDAS",
      source: "google_sheets",
      externalId: null,
    });
    expect(edit.occurredAt).toEqual(new Date(meta.at));
    expect(edit.rawPayload).toBe(modified);
  });

  it("summarizes whole-row values, skipping empty cells", () => {
    const rows = toHistoryRows(payload, connection);
    const add = rows[0];
    const del = rows[3];

    expect(add).toMatchObject({ newValue: "Ana, DESPENSA", oldValue: null, rowNumber: 15 });
    expect(del).toMatchObject({ oldValue: "Beto, DESPENSA", newValue: null, rowNumber: null });
  });

  it("stores no email when the script could not resolve the user", () => {
    const rows = toHistoryRows({ ...payload, meta: { ...meta, user: "unknown" } }, connection);

    expect(rows.every((r) => r.actorEmail === null)).toBe(true);
  });

  it("returns no rows for a modified change without changed columns", () => {
    const rows = toHistoryRows(
      { ...payload, changes: [{ ...modified, changed: undefined }] },
      connection,
    );

    expect(rows).toEqual([]);
  });
});

describe("SheetChangesPayload", () => {
  it("accepts the script's payload", () => {
    expect(SheetChangesPayload.safeParse(payload).success).toBe(true);
  });

  it.each([
    ["unknown change type", { ...payload, changes: [{ ...added, type: "borrado" }] }],
    ["non-ISO timestamp", { ...payload, meta: { ...meta, at: "03/11/2026" } }],
    ["non-string cell value", { ...payload, changes: [{ ...added, data: { Cantidad: 12 } }] }],
    ["empty changes", { ...payload, changes: [] }],
    ["missing tabId", { spreadsheetId: "sheet_1", meta, changes: [added] }],
    ["old field name sheetId", { sheetId: "sheet_1", tabId: 7, meta, changes: [added] }],
  ])("rejects %s", (_, body) => {
    expect(SheetChangesPayload.safeParse(body).success).toBe(false);
  });
});
