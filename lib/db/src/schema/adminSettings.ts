import { pgTable, text, serial } from "drizzle-orm/pg-core";

export const adminSettingsTable = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
});

export type AdminSettings = typeof adminSettingsTable.$inferSelect;
