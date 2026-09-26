import { generateId } from "better-auth";
import { organization, user } from "./schema.ts";
import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const pollingSheet = pgTable("polling_sheet", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => generateId()),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id),
  sheetId: text("sheet_id")
    .notNull()
    .references(() => sheet.id),
  turnOn: boolean("turn_on").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

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
