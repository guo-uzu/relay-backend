
import { google } from "googleapis"

const auth = new google.auth.GoogleAuth({
  keyFile: "./relay-509018-0e6dd68f6bad.json",
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
  ]
})

export const sheets = google.sheets({
  version: "v4",
  auth
})

