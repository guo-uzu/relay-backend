export class SheetImportError extends Error {}

const ID_HEADER = "_id";

export function parseSheetRows(rows: string[][]) {
  const headers = rows[0];
  if (!headers?.length) throw new SheetImportError("Worksheet has no headers");

  const idIndex = headers.indexOf(ID_HEADER);
  if (idIndex === -1 || headers.indexOf(ID_HEADER, idIndex + 1) !== -1) {
    throw new SheetImportError(`Headers must contain exactly one "${ID_HEADER}"`);
  }

  const seen = new Set<string>();
  const values: (string | null)[][] = [];

  rows.slice(1).forEach((row, i) => {
    if (row.every((cell) => cell === "")) return;

    const sheetRow = i + 2;
    if (row.slice(headers.length).some((cell) => cell !== "")) {
      throw new SheetImportError(`Row ${sheetRow} has data beyond the headers`);
    }

    const id = row[idIndex];
    if (!id) throw new SheetImportError(`Row ${sheetRow} has an empty ${ID_HEADER}`);
    if (seen.has(id)) throw new SheetImportError(`Row ${sheetRow} repeats ${ID_HEADER} "${id}"`);
    seen.add(id);

    values.push(headers.map((_, j) => (row[j] ? row[j] : null)));
  });

  return { headers, values };
}
