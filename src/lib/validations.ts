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

export const RowsQuerySchema = z.object({
  terms: z.array(z.string().max(200)).max(20).default([]),
  mode: z.enum(["and", "or"]).default("and"),
  filters: z
    .array(
      z.object({
        column: z.string().max(200),
        op: z.enum(["contains", "equals", "startsWith", "gt", "lt", "isEmpty"]),
        value: z.string().max(200).default(""),
      }),
    )
    .max(20)
    .default([]),
  fmode: z.enum(["and", "or"]).default("and"),
  sort: z.string().max(200).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export type RowsQuery = z.infer<typeof RowsQuerySchema>;

export const AppendRowsSchema = z.object({
  cells: z.array(z.string().max(1000)).min(1).max(100),
});
