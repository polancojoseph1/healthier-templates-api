import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const locationSettingsTable = pgTable("location_settings", {
  id: serial("id").primaryKey(),
  location: text("location").notNull(),
  period: text("period"),
  isCurrent: boolean("is_current").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LocationSetting = typeof locationSettingsTable.$inferSelect;