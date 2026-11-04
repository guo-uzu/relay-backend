import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { sheet } from "../db/app.schema.ts";

export const listSheets = async (organizationId: string) =>
  (
    await db
      .select({
        id: sheet.id,
        name: sheet.nameSheet,
        rowCount: sheet.rowCount,
        importedAt: sheet.importedAt,
      })
      .from(sheet)
      .where(eq(sheet.organizationId, organizationId))
      .orderBy(asc(sheet.nameSheet))
  ).map((s) => ({ ...s, importedAt: s.importedAt?.toISOString() ?? null }));
