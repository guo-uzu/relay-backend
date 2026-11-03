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

export const WebhookEventSchema = z.object({
  // deterministic id from the source (spreadsheet:tab:row:col:occurredAt); retries reuse it
  externalId: z.string().min(1),
  type: z.enum(["agregado", "editado", "eliminado"]),
  actorName: z.string().nullish(),
  actorEmail: z.string().nullish(),
  rowNumber: z.number().int().positive().nullish(),
  columnIndex: z.number().int().positive().nullish(),
  columnName: z.string().nullish(),
  oldValue: z.string().nullish(),
  newValue: z.string().nullish(),
  occurredAt: z.iso.datetime({ offset: true }),
});

export type WebhookEvent = z.infer<typeof WebhookEventSchema>;

export const WebhookPayload = z.object({
  v: z.literal(1),
  spreadsheetId: z.string().min(1),
  tabId: z.number().int(),
  events: z.array(WebhookEventSchema).min(1),
});
