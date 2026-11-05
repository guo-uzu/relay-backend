import { sheets } from "../lib/sheets.ts";

export async function getTabs(spreadsheetId: string) {
  const { data } = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });

  return (data.sheets ?? []).map((s) => ({
    id: s.properties!.sheetId!,
    title: s.properties!.title!,
  }));
}

// shortcut: one request for the whole tab, fine below ~10k rows; read in row ranges if Google's ~2MB response guidance is hit
export async function getTabRows(spreadsheetId: string, tabTitle: string) {
  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabTitle.replaceAll("'", "''")}'`,
  });

  return (data.values ?? []) as string[][];
}
