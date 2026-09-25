import z from "zod"

const REGEX_SHEETS_URL = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]{40,50})(?:\/|$)/

const LinkGoogleSheets = z.object({
  link: z.string()
    .regex(REGEX_SHEETS_URL, "Must be a Google Sheets Link")
    .transform((link) => REGEX_SHEETS_URL.exec(link)![1]),
})

export { LinkGoogleSheets }
