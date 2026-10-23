import { generateId } from "better-auth";
import { organization, user } from "./schema.ts";
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  index,
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
  // nullable: rows registered before the import feature have no tab id
  googleTabId: integer("google_tab_id"),
  headers: text("headers").array(),
  // shortcut: whole snapshot in one jsonb (rows are arrays aligned with headers), every import rewrites it; split into a sheet_row table when per-row edits, search or paging are needed
  values: jsonb("values").$type<(string | null)[][]>(),
  importedAt: timestamp("imported_at"),
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
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id),
  action: text().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
