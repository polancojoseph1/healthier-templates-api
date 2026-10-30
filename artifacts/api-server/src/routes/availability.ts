import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable } from "@workspace/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getEffectiveSlots, isPastDate, isValidDate } from "../lib/availability";

const router: IRouter = Router();

router.get("/availability", async (req, res) => {
  const { date, serviceId } = req.query as { date: string; serviceId: string };

  if (!date || !serviceId) {
    res.status(400).json({ error: "date and serviceId are required" });
    return;
  }

  try {
    if (!isValidDate(date) || isPastDate(date)) {
      res.status(400).json({ error: "A valid present or future date is required" });
      return;
    }
    if (!["temple-attunement", "reiki-plus"].includes(serviceId)) {
      res.status(400).json({ error: "Invalid service" });
      return;
    }

    const effectiveSlots = await getEffectiveSlots(date);
    if (effectiveSlots.length === 0) {
      res.json([]);
      return;
    }

    const existingBookings = await db
      .select({ time: bookingsTable.time })
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.date, date),
          inArray(bookingsTable.status, ["pending", "confirmed"]),
        ),
      );

    const bookedTimes = new Set(existingBookings.map((b) => b.time));

    const slots = effectiveSlots.map((time) => ({
      time,
      available: !bookedTimes.has(time),
    }));

    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
