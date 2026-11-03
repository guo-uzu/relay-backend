import { describe, it, expect } from "vitest";
import { fold, searchRows } from "../src/lib/rowsTable.ts";
import type { RowsQuery } from "../src/lib/validations.ts";

const headers = ["_id", "Nombre", "Colonia", "Monto"];
const values = [
  ["a1", "José Pérez", "Centro", "1500"],
  ["a2", "Ana", "Norte", "900"],
  ["a3", "", "Centro", null],
];

const q = (patch: Partial<RowsQuery> = {}): RowsQuery => ({
  terms: [],
  mode: "and",
  filters: [],
  fmode: "and",
  dir: "asc",
  page: 1,
  size: 20,
  ...patch,
});

describe("fold", () => {
  it("removes accents and lowercases like the frontend", () => {
    expect(fold("José Ángel")).toBe("jose angel");
    expect(fold("Ñandú")).toBe("nandu");
    expect(fold("ÜBER")).toBe("uber");
  });
});

describe("searchRows", () => {
  it("returns every row with empty cells as empty strings", () => {
    expect(searchRows(headers, values, q())).toEqual({
      total: 3,
      rows: [
        { n: 2, cells: ["a1", "José Pérez", "Centro", "1500"] },
        { n: 3, cells: ["a2", "Ana", "Norte", "900"] },
        { n: 4, cells: ["a3", "", "Centro", ""] },
      ],
    });
  });

  it("matches terms with AND and OR", () => {
    expect(searchRows(headers, values, q({ terms: ["jose", "centro"] })).total).toBe(1);
    expect(
      searchRows(headers, values, q({ terms: ["jose", "norte"], mode: "or" })).rows.map(
        (r) => r.n,
      ),
    ).toEqual([2, 3]);
  });

  it("finds accented text with an unaccented term", () => {
    expect(searchRows(headers, values, q({ terms: ["JOSE"] })).rows[0]!.n).toBe(2);
    expect(searchRows(headers, values, q({ terms: ["perez"] })).rows[0]!.n).toBe(2);
  });

  it.each([
    ["contains", "Nombre", "an", [3]],
    ["equals", "Colonia", "centro", [2, 4]],
    ["startsWith", "Nombre", "j", [2]],
    ["gt", "Monto", "1000", [2]],
    ["lt", "Monto", "1000", [3]],
    ["isEmpty", "Nombre", "", [4]],
  ] as const)("filters %s on %s", (op, column, value, expected) => {
    const { rows } = searchRows(headers, values, q({ filters: [{ column, op, value }] }));
    expect(rows.map((r) => r.n)).toEqual(expected);
  });

  it("combines filters with AND and OR", () => {
    const filters = [
      { column: "Colonia", op: "equals" as const, value: "Centro" },
      { column: "Monto", op: "gt" as const, value: "1000" },
    ];
    expect(searchRows(headers, values, q({ filters })).rows.map((r) => r.n)).toEqual([2]);
    expect(
      searchRows(headers, values, q({ filters, fmode: "or" })).rows.map((r) => r.n),
    ).toEqual([2, 4]);
  });

  it("requires terms and filters to match together", () => {
    const filters = [{ column: "Colonia", op: "equals" as const, value: "Centro" }];
    expect(searchRows(headers, values, q({ terms: ["jose"], filters })).total).toBe(1);
    expect(searchRows(headers, values, q({ terms: ["ana"], filters })).total).toBe(0);
  });

  it("sorts by a column without losing the row number", () => {
    const asc = searchRows(headers, values, q({ sort: "Nombre" }));
    expect(asc.rows.map((r) => [r.n, r.cells[1]])).toEqual([
      [4, ""],
      [3, "Ana"],
      [2, "José Pérez"],
    ]);

    const desc = searchRows(headers, values, q({ sort: "Monto", dir: "desc" }));
    expect(desc.rows.map((r) => r.cells[3])).toEqual(["1500", "900", ""]);
  });

  it("ignores an unknown sort column", () => {
    expect(searchRows(headers, values, q({ sort: "Nope" })).rows.map((r) => r.n)).toEqual([
      2, 3, 4,
    ]);
  });

  it("paginates after filtering and reports the filtered total", () => {
    const { rows, total } = searchRows(headers, values, q({ page: 2, size: 2 }));
    expect(total).toBe(3);
    expect(rows.map((r) => r.n)).toEqual([4]);
  });

  it("handles a connection without an imported snapshot", () => {
    expect(searchRows(headers, null, q())).toEqual({ rows: [], total: 0 });
  });
});
