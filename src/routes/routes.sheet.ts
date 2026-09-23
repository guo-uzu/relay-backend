import express, { type Router, type Request, type Response } from "express";
import { sheets, drive } from "../lib/sheets.ts";
import { clientRedis } from "../lib/redis.ts";

const routerSheets: Router = express.Router();

routerSheets.get("/:id/get-titles", async (req: Request, res: Response) => {
  try {
    const meta = await drive.files.get({ fileId: process.env.GOOGLE_SPREADSHEET_ID, fields: "modifiedTime" })
    const cached = JSON.parse(await clientRedis.get(`sheet:${process.env.GOOGLE_SPREADSHEET_ID}:headers`) || "null")
    if (cached && cached.modifiedTime === meta.data.modifiedTime) {
      return res
        .status(200)
        .json({ message: "Fetched data", data: cached.headers, error: null });
    }

    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: "Registro de Peticiones (Interno)!1:1",
    });

    if (!data.values) throw new Error("Error");
    const headers = data.values?.[0] || [];
    await clientRedis.set(`sheet:${process.env.GOOGLE_SPREADSHEET_ID}:headers`, JSON.stringify({ headers, modifiedTime: meta.data.modifiedTime }), { EX: 3600 })
    return res
      .status(200)
      .json({ message: "Fetched data", data: data.values[0], error: null });
  } catch (error) {
    return res.status(500).json({ message: "Error caching titles" });
  }
});

routerSheets.put("/:id/polling", async (req: Request, res: Response) => {
  return res.status(200).json({
    message: "Polling activated"
  })
})


routerSheets.get("/get-data", async (req: Request, res: Response) => {
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: "Registro de Peticiones (Interno)!B1:Z",
    });
    if (!data.values || data.values?.length <= 0) throw new Error("Error");
    return res
      .status(200)
      .json({ message: "Fetched data", data: data.values, error: null });
  } catch (error) {
    return res.status(500).json({ message: "Error" });
  }
});

export { routerSheets };
