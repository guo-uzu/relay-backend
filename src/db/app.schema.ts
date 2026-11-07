import { generateId } from "better-auth";
import { organization, user } from "./schema.ts";
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const sheet = pgTable("sheet", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id),
  sheetId: text("sheet_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  nameSheet: text("name").notNull(),
  rowCount: integer("row_count").notNull().default(0),
  // nullable: rows registered before the import feature have no tab id
  googleTabId: integer("google_tab_id"),
  headers: text("headers").array(),
  // shortcut: whole snapshot in one jsonb ({ n: sheet row number, cells: raw API row }), every import rewrites it; split into a sheet_row table when per-row edits, search or paging are needed
  values: jsonb("values").$type<{ n: number; cells: string[] }[]>(),
  importedAt: timestamp("imported_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, (table) => [
  index("organization_sheet_name_idx")
    .using("btree", table.organizationId, table.sheetId, sql`lower(${table.nameSheet})`),
  index("values_idx").using("gin", table.values)
]);

export const history = pgTable("history", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id),
  // relay user when the action came from Relay; nullable because Google Sheets
  // changes are attributed to Google accounts, which do not always map to a member
  userId: text("user_id").references(() => user.id),
  // the sheet connection this event belongs to (nullable for org-level events)
  sheetId: text("sheet_id").references(() => sheet.id),
  // typed event so the dashboard can group/count without parsing text:
  // 'agregado' | 'editado' | 'eliminado' | 'importado' | 'conectado'
  eventType: text("event_type").notNull(),
  // who did it: Google display name/email, or the relay user's
  actorName: text("actor_name"),
  actorEmail: text("actor_email"),
  // optional human-readable summary for events that are not a single cell change
  action: text("action"),
  // cell-level detail: 1-based row, 1-based column index + optional header name
  rowNumber: integer("row_number"),
  columnIndex: integer("column_index"),
  columnName: text("column_name"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  // 'google_sheets' | 'relay'
  source: text("source").notNull().default("google_sheets"),
  // when the change happened (from the payload) vs when we stored it
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // id given by the source for this change; retries of the same change collide
  // on the unique index below instead of duplicating the event
  externalId: text("external_id"),
  // keep the original change object so we can re-parse later without loss
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("history_org_occurred_idx").using("btree", table.organizationId, table.occurredAt),
  index("history_org_type_occurred_idx").using("btree", table.organizationId, table.eventType, table.occurredAt),
  index("history_sheet_occurred_idx").using("btree", table.sheetId, table.occurredAt),
  uniqueIndex("history_sheet_external_uidx")
    .on(table.sheetId, table.externalId)
    .where(sql`${table.externalId} is not null`),
]);
