import express, { type Request, type Response, type Router } from "express";
import { and, count, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { User } from "better-auth";
import { db } from "../db/index.ts";
import { history, sheet } from "../db/app.schema.ts";
import { member } from "../db/schema.ts";
import { validateUserOrgRole } from "../lib/validate.user.org.ts";
import {
  EVENT_TYPES,
  mxDayRange,
  toHistoryEvent,
  todayCounts,
} from "../lib/dashboard.ts";
import { listSheets } from "../lib/sheetsList.ts";

const routerOrgs: Router = express.Router();
const MEMBER_ROLES = ["admin", "owner", "member"];

routerOrgs.get("/:id/dashboard", async (req: Request, res: Response) => {
  const organizationId = req.params.id as string;
  const user = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, user.id, MEMBER_ROLES)))
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });

  try {
    const { start, end } = mxDayRange();

    const events = await db
      .select({
        id: history.id,
        eventType: history.eventType,
        source: history.source,
        actorName: history.actorName,
        actorEmail: history.actorEmail,
        occurredAt: history.occurredAt,
        rowNumber: history.rowNumber,
        columnIndex: history.columnIndex,
        columnName: history.columnName,
        oldValue: history.oldValue,
        newValue: history.newValue,
        rawPayload: history.rawPayload,
        sheetName: sheet.nameSheet,
      })
      .from(history)
      .leftJoin(sheet, eq(history.sheetId, sheet.id))
      .where(
        and(
          eq(history.organizationId, organizationId),
          inArray(history.eventType, EVENT_TYPES),
        ),
      )
      .orderBy(desc(history.occurredAt))
      .limit(15);

    const today = await db
      .select({ eventType: history.eventType, count: count() })
      .from(history)
      .where(
        and(
          eq(history.organizationId, organizationId),
          gte(history.occurredAt, start),
          lt(history.occurredAt, end),
          inArray(history.eventType, EVENT_TYPES),
        ),
      )
      .groupBy(history.eventType);

    const [{ used }] = await db
      .select({ used: count() })
      .from(member)
      .where(eq(member.organizationId, organizationId));

    return res.json({
      today: todayCounts(today),
      events: events.map(toHistoryEvent),
      sheets: await listSheets(organizationId),
      seats: { used: Number(used) },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error loading dashboard" });
  }
});

export { routerOrgs };
