import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { locationSettingsTable } from "@workspace/db/schema";

const router: IRouter = Router();

router.get("/locations", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: locationSettingsTable.id,
        location: locationSettingsTable.location,
        period: locationSettingsTable.period,
        isCurrent: locationSettingsTable.isCurrent,
        sortOrder: locationSettingsTable.sortOrder,
      })
      .from(locationSettingsTable)
      .where(eq(locationSettingsTable.isPublished, true))
      .orderBy(asc(locationSettingsTable.sortOrder), asc(locationSettingsTable.id));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Unable to load locations" });
  }
});

export default router;