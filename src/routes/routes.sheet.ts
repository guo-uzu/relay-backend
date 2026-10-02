import express, { type Router, type Request, type Response } from "express";
import { sheets } from "../lib/sheets.ts";
import { SetSheetId, SheetIdBody } from "../lib/validations.ts";
import z from "zod";
import { db } from "../db/index.ts";
import { pollingSheet, sheet } from "../db/app.schema.ts";
import {
  validateUserOrg,
  validateUserOrgRole,
} from "../lib/validate.user.org.ts";
import type { User } from "better-auth";
import { SheetQueue } from "../jobs/sheetQueue.ts";
import { eq, and } from "drizzle-orm";
import { getSheetTitles } from "../services/googleSheets.service.ts";

const routerSheets: Router = express.Router();
const SHEET_POLL_INTERVAL_MS = 60_000;
const ORGANIZATION_ROLES = ["admin", "owner"];
/*
  @param :id is the id of the organization
*/

routerSheets.post("/:id/set-sheet-id", async (req: Request, res: Response) => {
  const result = SetSheetId.safeParse(req.body);
  const organizationId = req.params.id as string;

  if (!result.success) {
    return res.status(400).json({
      message: "Incomplete data sended",
      error: z.flattenError(result.error).fieldErrors,
    });
  }

  const user = res.locals.user as User;

  if (!(await validateUserOrg(organizationId, user.id)))
    return res.status(401).json({ message: "Unauthorized" });
  const spreadsheetId = result.data.sheetId;
  const spreadsheetName = result.data.nameSheet;
  try {
    await db.insert(sheet).values({
      sheetId: spreadsheetId,
      name: spreadsheetName,
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
    const organizationId = req.params.id as string;
    const user = res.locals.user as User;

    if (
      !(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES))
    ) {
      return res.status(403).json({
        message: "Forbidden",
      });
    }

    const result = SheetIdBody.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid sheet id",
        error: z.flattenError(result.error).fieldErrors,
      });
    }

    const { sheetId } = result.data;

    const [sheetData] = await db
      .select({
        name: sheet.name,
      })
      .from(sheet)
      .where(
        and(
          eq(sheet.organizationId, organizationId),
          eq(sheet.sheetId, sheetId),
        ),
      )
      .limit(1);

    if (!sheetData) {
      return res.status(404).json({
        message: "Sheet not found",
      });
    }

    const headers = await getSheetTitles({
      spreadsheetId: sheetId,
      sheetName: sheetData.name,
    });

    return res
      .status(200)
      .json({ message: "Fetched data", data: headers, error: null });
  } catch (error) {
    console.error(error);

    return res.status(500).json({ message: "Error caching titles" });
  }
});

routerSheets.put("/:id/polling-titles", async (req: Request, res: Response) => {
  try {
    const organizationId = req.params.id as string;
    const user = res.locals.user as User;

    if (
      !(await validateUserOrgRole(organizationId, user.id, ORGANIZATION_ROLES))
    ) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const result = SheetIdBody.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        message: "Invalid sheet id",
        error: z.flattenError(result.error).fieldErrors,
      });
    }

    const [sheetData] = await db
      .select({ id: sheet.id })
      .from(sheet)
      .where(
        and(
          eq(sheet.organizationId, organizationId),
          eq(sheet.sheetId, result.data.sheetId),
        ),
      )
      .limit(1);

    if (!sheetData) {
      return res.status(404).json({ message: "Sheet not found" });
    }

    const existingScheduler = await SheetQueue.getJobScheduler(
      `sheet-poll:${organizationId}:${sheetData.id}`,
    );

    if (existingScheduler) {
      return res.status(409).json({ message: "Polling already exists" });
    }

    await SheetQueue.upsertJobScheduler(
      `sheet-poll:${organizationId}:${sheetData.id}`,
      { every: SHEET_POLL_INTERVAL_MS },
      {
        name: "poll-sheet-titles",
        data: { organizationId, sheetDbId: sheetData.id },
        opts: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
          removeOnComplete: 100,
          removeOnFail: 1000,
        },
      },
    );

    await db.insert(pollingSheet).values({
      sheetId: sheetData.id,
      organizationId: organizationId,
      turnOn: true,
    });

    return res.status(200).json({
      message: "Polling activated",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error activating polling" });
  }
});

routerSheets.delete(
  "/:id/stop-polling",
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.params.id as string;
      const user = res.locals.user as User;

      if (
        !(await validateUserOrgRole(
          organizationId,
          user.id,
          ORGANIZATION_ROLES,
        ))
      ) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const result = SheetIdBody.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          message: "Invalid sheet id",
          error: z.flattenError(result.error).fieldErrors,
        });
      }

      const [sheetData] = await db
        .select({ id: sheet.id })
        .from(sheet)
        .where(
          and(
            eq(sheet.organizationId, organizationId),
            eq(sheet.sheetId, result.data.sheetId),
          ),
        )
        .limit(1);

      if (!sheetData) {
        return res.status(404).json({ message: "Sheet not found" });
      }

      const existingScheduler = await SheetQueue.getJobScheduler(
        `sheet-poll:${organizationId}:${sheetData.id}`,
      );

      if (!existingScheduler) {
        return res.status(409).json({ message: "Polling is not activated" });
      }

      await SheetQueue.removeJobScheduler(
        `sheet-poll:${organizationId}:${sheetData.id}`,
      );

      await db
        .update(pollingSheet)
        .set({ turnOn: false })
        .where(
          and(
            eq(pollingSheet.organizationId, organizationId),
            eq(pollingSheet.sheetId, sheetData.id),
          ),
        );

      return res.status(200).json({
        message: "Polling deactivated",
      });
    } catch (error) {
      console.error(error);

      return res.status(500).json({ message: "Error deactivating polling" });
    }
  },
);

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
