export class SheetImportError extends Error {}

export function parseSheetRows(rows: string[][]) {
  if (!rows || rows.length === 0) {
    throw new SheetImportError("Worksheet is empty");
  }

  // Encuentra la primera fila que contenga al menos una celda con texto
  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => cell && cell.trim() !== "")
  );

  if (headerRowIndex === -1) {
    throw new SheetImportError("Worksheet has no headers");
  }

  const rawHeaders = rows[headerRowIndex];
  // Filtra y limpia los encabezados
  const headers = rawHeaders.map((h, i) => (h && h.trim() !== "" ? h.trim() : `Columna ${i + 1}`));

  const values: (string | null)[][] = [];

  rows.slice(headerRowIndex + 1).forEach((row) => {
    // Omite filas totalmente en blanco
    if (row.every((cell) => !cell || cell.trim() === "")) return;

    values.push(
      headers.map((_, j) => (row[j] && row[j].trim() !== "" ? row[j].trim() : null))
    );
  });

  return { headers, values };
}