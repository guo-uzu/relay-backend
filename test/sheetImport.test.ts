import { describe, it, expect } from "vitest";
import { parseSheetRows, SheetImportError } from "../src/lib/sheetImport.ts";

describe("parseSheetRows", () => {
  it("keeps sheet row numbers and raw cells, skipping blank rows", () => {
    const { headers, values } = parseSheetRows([
      ["_id", "name", "email"],
      ["a", "Ana", ""],
      ["", "", ""],
      ["b"],
    ]);
    expect(headers).toEqual(["_id", "name", "email"]);
    expect(values).toEqual([
      { n: 1, cells: ["a", "Ana", ""] },
      { n: 3, cells: ["b"] },
    ]);
  });

  it.each([
    ["no _id header", [["name"], ["Ana"]]],
    ["duplicate _id header", [["_id", "_id"], ["a", "b"]]],
    ["empty _id", [["_id", "name"], ["", "Ana"]]],
    ["repeated _id", [["_id"], ["a"], ["a"]]],
    ["data beyond headers", [["_id"], ["a", "extra"]]],
    ["no rows", []],
  ])("rejects %s", (_, rows) => {
    expect(() => parseSheetRows(rows)).toThrow(SheetImportError);
  });
});
