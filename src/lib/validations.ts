import { z } from "zod";

export const REGEX_SHEETS_URL = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]{40,50})(?:\/|$)/;

export const SetSheetId = z.object({
  sheetId: z.string().min(1, "Sheet id is required"),
  nameSheet: z.string().min(1, "Sheet name is required")
});

export const ImportSheetBody = z.object({
  connectionId: z.string().min(1, "Connection id is required"),
})

export const TestSheetId = z.object({
  sheetId: z.string().regex(/^[a-zA-Z0-9_-]{40,50}$/, "Invalid sheet id"),
})

export const SheetPayloadSchema = z.object({
  sheetId: z.string(),
  meta: z.any(),
  changes: z.any()
})
