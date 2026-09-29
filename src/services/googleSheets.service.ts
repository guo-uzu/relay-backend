import { drive, sheets } from "../lib/sheets.ts"
import { clientRedis } from "../lib/redis.ts";


export async function getSheetTitles({
  spreadsheetId,
  sheetName,
}: {
  spreadsheetId: string;
  sheetName?: string;
}) {
  const meta = await drive.files.get({
    fileId: spreadsheetId,
    fields: "modifiedTime",
  });

  const cacheKey = `sheet:${spreadsheetId}:headers`;

  const cached = JSON.parse((await clientRedis.get(cacheKey)) || "null");

  if (cached?.modifiedTime === meta.data.modifiedTime) {
    return cached.headers;
  }

  const { data } = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName ? `'${sheetName.replaceAll("'", "''")}'!1:1` : "1:1",
  });

  const headers = data.values?.[0];

  if (!headers) {
    throw new Error("Spreadsheet has no headers");
  }

  await clientRedis.set(
    cacheKey,
    JSON.stringify({
      headers,
      modifiedTime: meta.data.modifiedTime,
    }),
    { EX: 3600 },
  );

  return headers;
}
