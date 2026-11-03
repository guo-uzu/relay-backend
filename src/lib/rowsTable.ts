import type { RowsQuery } from "./validations.ts";

export type Row = { n: number; cells: string[] };

// Must fold like the frontend (relay-frontend/src/lib.ts): NFD without combining
// marks and lowercased, otherwise rows are found but the match is not highlighted.
export const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const cell = (v: string | null | undefined) => v ?? "";

const compare = (a: string, b: string) => {
  const na = Number(a);
  const nb = Number(b);
  if (a.trim() !== "" && b.trim() !== "" && Number.isFinite(na) && Number.isFinite(nb))
    return na - nb;

  const fa = fold(a);
  const fb = fold(b);
  return fa < fb ? -1 : fa > fb ? 1 : 0;
};

type Filter = RowsQuery["filters"][number];

const matches = (value: string, op: Filter["op"], expected: string) => {
  if (op === "isEmpty") return value.trim() === "";
  if (op === "gt" || op === "lt") {
    // an empty cell is not greater or smaller than anything
    if (!value.trim()) return false;
    return op === "gt" ? compare(value, expected) > 0 : compare(value, expected) < 0;
  }

  const a = fold(value);
  const b = fold(expected);
  if (op === "contains") return a.includes(b);
  if (op === "equals") return a === b;
  return a.startsWith(b);
};

// shortcut: the whole snapshot is filtered in memory per request, fine below ~10k rows; move to SQL when sheets grow
export function searchRows(
  headers: string[],
  values: (string | null)[][] | null,
  query: RowsQuery,
): { rows: Row[]; total: number } {
  // row 1 is the header row, so the first data row is 2 (blank rows were skipped on import)
  const rows: Row[] = (values ?? []).map((cells, i) => ({ n: i + 2, cells: cells.map(cell) }));

  const terms = query.terms.map(fold).filter(Boolean);
  const filtered = rows.filter(({ cells }) => {
    if (terms.length) {
      const folded = cells.map(fold);
      const hit = (term: string) => folded.some((c) => c.includes(term));
      if (!(query.mode === "and" ? terms.every(hit) : terms.some(hit))) return false;
    }
    if (!query.filters.length) return true;

    const results = query.filters.map((rule) => {
      const i = headers.indexOf(rule.column);
      return i !== -1 && matches(cell(cells[i]), rule.op, rule.value);
    });
    return query.fmode === "and" ? results.every(Boolean) : results.some(Boolean);
  });

  if (query.sort) {
    const i = headers.indexOf(query.sort);
    if (i !== -1) {
      const dir = query.dir === "desc" ? -1 : 1;
      filtered.sort((a, b) => dir * compare(cell(a.cells[i]), cell(b.cells[i])));
    }
  }

  const start = (query.page - 1) * query.size;
  return { rows: filtered.slice(start, start + query.size), total: filtered.length };
}
