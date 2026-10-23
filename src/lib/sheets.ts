import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  keyFile: "./relay-test-credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export const sheets = google.sheets({
  version: "v4",
  auth,
});
