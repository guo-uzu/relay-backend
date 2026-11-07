export class SheetImportError extends Error {}

const ID_HEADER = "_id";

export type SheetRow = { n: number; cells: string[] };

export function parseSheetRows(rows: string[][]) {
  const headers = rows[0];
  if (!headers?.length) throw new SheetImportError("Worksheet has no headers");

  const idIndex = headers.indexOf(ID_HEADER);
  if (idIndex === -1 || headers.indexOf(ID_HEADER, idIndex + 1) !== -1) {
    throw new SheetImportError(`Headers must contain exactly one "${ID_HEADER}"`);
  }

  const seen = new Set<string>();
  const values: SheetRow[] = [];

  rows.slice(1).forEach((row, i) => {
    if (row.every((cell) => cell === "")) return;

    const n = i + 1;
    if (row.slice(headers.length).some((cell) => cell !== "")) {
      throw new SheetImportError(`Row ${n} has data beyond the headers`);
    }

    const id = row[idIndex];
    if (!id) throw new SheetImportError(`Row ${n} has an empty ${ID_HEADER}`);
    if (seen.has(id)) throw new SheetImportError(`Row ${n} repeats ${ID_HEADER} "${id}"`);
    seen.add(id);

    values.push({ n, cells: row });
  });

  return { headers, values };
}
