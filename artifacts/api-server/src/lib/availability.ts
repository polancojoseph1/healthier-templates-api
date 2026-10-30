import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  availabilityOverridesTable,
  availabilityScheduleTable,
} from "@workspace/db/schema";

export const SLOT_PATTERN = /^(?:0[9]|1[0-7]):00$/;

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isPastDate(value: string): boolean {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return value < today;
}

export async function getEffectiveSlots(date: string): Promise<string[]> {
  const [override] = await db
    .select()
    .from(availabilityOverridesTable)
    .where(
      and(
        lte(availabilityOverridesTable.startDate, date),
        gte(availabilityOverridesTable.endDate, date),
      ),
    )
    .orderBy(desc(availabilityOverridesTable.id))
    .limit(1);

  if (override) {
    return override.isOpen ? override.timeSlots.filter((slot) => SLOT_PATTERN.test(slot)) : [];
  }

  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
  const [schedule] = await db
    .select()
    .from(availabilityScheduleTable)
    .where(eq(availabilityScheduleTable.dayOfWeek, dayOfWeek))
    .limit(1);

  return schedule?.isActive
    ? schedule.timeSlots.filter((slot) => SLOT_PATTERN.test(slot))
    : [];
}
