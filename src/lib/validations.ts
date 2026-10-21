import { z } from "zod";

export const REGEX_SHEETS_URL = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]{40,50})(?:\/|$)/;

export const SetSheetId = z.object({
  sheetId: z.string().min(1, "Sheet id is required"),
  nameSheet: z.string().min(1, "Sheet name is required")
});

export const SheetIdBody = z.object({
  sheetId: z.string().min(1, "Sheet id is required"),
});

export const SheetChangeItemSchema = z.object({
  type: z.string(),
  id: z.string(),
  row: z.number(),
  data: z.record(z.string(), z.unknown()),
  changed: z.record(z.string(), z.unknown()).optional()
});

export const SheetPayloadSchema = z.object({
  sheetId: z.string().min(1),
  meta: z.object({
    at: z.string(),
    user: z.string(),
    trigger: z.string()
  }),
  changes: z.array(SheetChangeItemSchema)
});

export type SheetPayload = z.infer<typeof SheetPayloadSchema>;
export type SheetChangeItem = z.infer<typeof SheetChangeItemSchema>;