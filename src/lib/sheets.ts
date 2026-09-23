import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  keyFile: "./relay-test-credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
});

export const sheets = google.sheets({
  version: "v4",
  auth,
});

export const drive = google.drive({
  version: "v3",
  auth
})
