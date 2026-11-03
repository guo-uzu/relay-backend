import express, { type Request, type Response, type Router } from "express";
import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import type { User } from "better-auth";
import { db } from "../db/index.ts";
import { history, sheet } from "../db/app.schema.ts";
import { member } from "../db/schema.ts";
import { validateUserOrgRole } from "../lib/validate.user.org.ts";
import {
  buildSeries,
  EVENT_TYPES,
  lastDays,
  safeTz,
  toHistoryEvent,
  topActors,
} from "../lib/dashboard.ts";
import { listSheets } from "../lib/sheetsList.ts";

const routerOrgs: Router = express.Router();
const MEMBER_ROLES = ["admin", "owner", "member"];

routerOrgs.get("/:id/dashboard", async (req: Request, res: Response) => {
  const organizationId = req.params.id as string;
  const user = res.locals.user as User;

  if (!(await validateUserOrgRole(organizationId, user.id, MEMBER_ROLES)))
    return res.status(403).json({ message: "Forbidden", code: "FORBIDDEN" });

  const tz = safeTz(req.query.tz);
  const days = lastDays(30, tz);

  try {
    // 2 extra days absorb any timezone offset when filtering by the client's day
    const since = new Date(Date.now() - 32 * 864e5);
    const rows = await db
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
          gte(history.occurredAt, since),
          inArray(history.eventType, EVENT_TYPES),
        ),
      )
      .orderBy(desc(history.occurredAt));

    const [{ used }] = await db
      .select({ used: count() })
      .from(member)
      .where(eq(member.organizationId, organizationId));

    return res.json({
      series: buildSeries(rows, days, tz),
      events: rows.slice(0, 15).map(toHistoryEvent),
      actors: topActors(rows, days, tz),
      sheets: await listSheets(organizationId),
      seats: {
        used,
        max: (user as { plan?: string }).plan === "pro" ? 50 : 5,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error loading dashboard" });
  }
});

export { routerOrgs };
