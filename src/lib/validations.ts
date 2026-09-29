import z from "zod"

const REGEX_SHEETS_URL = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]{40,50})(?:\/|$)/

const SetSheetId = z.object({
  sheetId: z.string().min(1, "Sheet id is required"),
  nameSheet: z.string().min(1, "Sheet name is required")
})

const SheetIdBody = z.object({
  sheetId: z.string().min(1, "Sheet id is required"),
})

export { SetSheetId, SheetIdBody }
