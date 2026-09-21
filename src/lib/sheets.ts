import { google } from "googleapis";

const auth = new google.auth.GoogleAuth({
  keyFile: "./relay-509018-2a24d38ac416.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

export const sheets = google.sheets({
  version: "v4",
  auth,
});
