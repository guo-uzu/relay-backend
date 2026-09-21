import express, { type Router, type Request, type Response } from "express";
import { sheets } from "../lib/sheets.ts";

const routerSheets: Router = express.Router();

routerSheets.get("/get-titles", async (req: Request, res: Response) => {
  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: "Registro de Peticiones (Interno)!1:1",
    });
    if (!data.values || data.values?.length <= 0) throw new Error("Error");
    return res
      .status(200)
      .json({ message: "Fetched data", data: data.values[0], error: null });
  } catch (error) {
    return res.status(500).json({ message: error });
  }
});

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
