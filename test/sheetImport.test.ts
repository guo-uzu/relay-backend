import { describe, it, expect } from "vitest";
import { parseSheetRows, SheetImportError } from "../src/lib/sheetImport.ts";

describe("parseSheetRows", () => {
  it("pads short rows, nulls blanks and skips blank rows", () => {
    const { headers, values } = parseSheetRows([
      ["_id", "name", "email"],
      ["a", "Ana", ""],
      ["", "", ""],
      ["b"],
    ]);
    expect(headers).toEqual(["_id", "name", "email"]);
    expect(values).toEqual([
      ["a", "Ana", null],
      ["b", null, null],
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
