import { generateId } from "better-auth"
import { organization, user } from "./schema.ts";
import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const sheet = pgTable(
  "sheet",
  {
    id: text("id").primaryKey().$defaultFn(() => generateId()),
    organizationId: text("organization_id").notNull().references(() => organization.id),
    sheetId: text("sheet_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  }
)
