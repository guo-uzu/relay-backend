import express, { type Router, type Request, type Response } from "express";
import { sheets, drive } from "../lib/sheets.ts";
import { clientRedis } from "../lib/redis.ts";
import { LinkGoogleSheets } from "../lib/validations.ts";
import z from "zod";
import { db } from "../db/index.ts";
import { sheet } from "../db/app.schema.ts";
import { validateUserOrg } from "../lib/validate.user.org.ts";
import type { User } from "better-auth";
import { SheetQueue } from "../jobs/sheetQueue.ts";
import { organization } from "../db/schema.ts";
import { eq } from "drizzle-orm";

const routerSheets: Router = express.Router();
/*
  @param :id is the id of the organization
*/

routerSheets.post("/:id/set-sheet-id", async (req: Request, res: Response) => {
  const result = LinkGoogleSheets.safeParse(req.body);
  const organizationId = req.params.id as string;

  if (!result.success) {
    return res.status(400).json({
      message: "Invalid ID organization",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  const user = res.locals.user as User;

  if (!(await validateUserOrg(organizationId, user.id)))
    return res.status(401).json({ message: "Unauthorized" });
  const spreadsheetId = result.data.link;

  try {
    await db.insert(sheet).values({
      sheetId: spreadsheetId,
      organizationId: organizationId,
      userId: user.id,
    });
  } catch (error) {
    return res.status(406).json({
      message: "Error uploading the data",
      error: error,
    });
  }
  return res.status(201).json({ message: "id added", data: { spreadsheetId } });
});

routerSheets.get("/:id/get-titles", async (req: Request, res: Response) => {
  try {
    const meta = await drive.files.get({
      fileId: process.env.GOOGLE_SPREADSHEET_ID,
      fields: "modifiedTime",
    });
    const cached = JSON.parse(
      (await clientRedis.get(
        `sheet:${process.env.GOOGLE_SPREADSHEET_ID}:headers`,
      )) || "null",
    );
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
    await clientRedis.set(
      `sheet:${process.env.GOOGLE_SPREADSHEET_ID}:headers`,
      JSON.stringify({ headers, modifiedTime: meta.data.modifiedTime }),
      { EX: 3600 },
    );
    return res
      .status(200)
      .json({ message: "Fetched data", data: data.values[0], error: null });
  } catch (error) {
    return res.status(500).json({ message: "Error caching titles" });
  }
});

routerSheets.put("/:id/polling-titles", async (req: Request, res: Response) => {
  const organizationId = req.params.id as string;
  const user = res.locals.user as User;

  const data = db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId))

  if (!data) {
    return res.status(404).json({
      message: "Organization not found",
    });
  }
/*
    await SheetQueue.upsertJobScheduler(`org-${organizationId}:id-${selectedSheet}`, {
    every: 10000
  },
    {
      name: `Polling`,
      data: { url: `http://localhost:3000/api/v1/google-sheets/${organizationId}/get-titles`, idGoogleSheets: selectedSheet, organizationId: organizationId },
      opts: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000
        }
      }
  })
  */
  return res.status(200).json({
    message: "Polling activated",
  });
});

routerSheets.delete("/:id/stop-polling", async (req: Request, res: Response) => {
  const selectedSheet = req.body.polling

  await SheetQueue.removeJobScheduler(selectedSheet)
  return res.status(200).json({
    message: "Polling deactivated"
  })
})


routerSheets.get("/:id/get-data", async (req: Request, res: Response) => {
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
