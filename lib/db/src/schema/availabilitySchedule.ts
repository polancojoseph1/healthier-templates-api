import { pgTable, text, serial, integer, boolean, date, timestamp } from "drizzle-orm/pg-core";

export const availabilityScheduleTable = pgTable("availability_schedule", {
  id: serial("id").primaryKey(),
  dayOfWeek: integer("day_of_week").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  timeSlots: text("time_slots").array().notNull(),
});

export type AvailabilitySchedule = typeof availabilityScheduleTable.$inferSelect;

export const availabilityOverridesTable = pgTable("availability_overrides", {
  id: serial("id").primaryKey(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  isOpen: boolean("is_open").notNull().default(false),
  timeSlots: text("time_slots").array().notNull().default([]),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AvailabilityOverride = typeof availabilityOverridesTable.$inferSelect;
