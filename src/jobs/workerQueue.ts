import { Worker } from "bullmq";
import { bullConnection } from "./bullConnection.ts";
import { db } from "../db/index.ts";
import { sheet } from "../db/app.schema.ts";
import { eq } from "drizzle-orm";
import { getSheetTitles } from "../services/googleSheets.service.ts";

const worker = new Worker(
  "polling-sheet",
  async (job) => {
    if (job.name !== "poll-sheet-titles") return;

    const [sheetData] = await db
      .select({
        sheetId: sheet.sheetId,
        name: sheet.name,
      })
      .from(sheet)
      .where(eq(sheet.id, job.data.sheetDbId))
      .limit(1);

    if (!sheetData) {
      return { skipped: "Sheet not found" };
    }

    const headers = await getSheetTitles({
      spreadsheetId: sheetData.sheetId,
      sheetName: sheetData.name,
    });

    console.log("Sheet headers:", headers);

    return { headers };
  },
  { connection: bullConnection },
);
