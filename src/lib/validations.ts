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

export const SheetRowFilter = z.object({
  column: z.string(),
  op: z.enum(["contains", "equals", "startsWith", "gt", "lt", "isEmpty"]),
  value: z.string().default(""),
});

export const SheetRowsBody = z.object({
  terms: z.array(z.string()).default([]),
  mode: z.enum(["and", "or"]).default("and"),
  filters: z.array(SheetRowFilter).default([]),
  fmode: z.enum(["and", "or"]).default("and"),
  sort: z.string().nullish(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.number().int().positive().default(1),
  size: z.number().int().positive().default(20),
});

export const HeaderConfigBody = z.object({
  name: z.string().min(1),
  obligatory: z.boolean(),
});

export const HeaderConfigsBody = z.array(HeaderConfigBody);

export const AppendRowBody = z.object({
  cells: z.union([
    z.array(z.string()),
    z.record(z.string(), z.string()),
  ]),
});

export const WebhookEventSchema = z.object({
  // deterministic id from the source; retries reuse it and the DB ignores the duplicate
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
  spreadsheetId: z.string().min(1),
  tabId: z.number().int(),
  event: WebhookEventSchema,
});
