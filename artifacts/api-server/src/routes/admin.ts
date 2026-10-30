import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  adminSettingsTable,
  bookingsTable,
  availabilityScheduleTable,
  availabilityOverridesTable,
  locationSettingsTable,
} from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import crypto from "crypto";
import { isValidDate, SLOT_PATTERN } from "../lib/availability";

const ALL_SLOTS = ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];

const DEFAULT_SCHEDULE = [
  { dayOfWeek: 0, isActive: false, timeSlots: [] },
  { dayOfWeek: 1, isActive: true,  timeSlots: ALL_SLOTS },
  { dayOfWeek: 2, isActive: true,  timeSlots: ALL_SLOTS },
  { dayOfWeek: 3, isActive: true,  timeSlots: ALL_SLOTS },
  { dayOfWeek: 4, isActive: true,  timeSlots: ALL_SLOTS },
  { dayOfWeek: 5, isActive: true,  timeSlots: ALL_SLOTS },
  { dayOfWeek: 6, isActive: false, timeSlots: [] },
];

const router: IRouter = Router();

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = "sha512";

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString("hex");
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derived = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(derived, "hex"), Buffer.from(hash, "hex"));
}

function createHash(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  return `${salt}:${hash}`;
}

const activeSessions = new Map<string, number>();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function isValidToken(token: string): boolean {
  const ts = activeSessions.get(token);
  if (!ts) return false;
  if (Date.now() - ts > SESSION_TTL_MS) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

async function ensureAdminExists() {
  const existing = await db.select().from(adminSettingsTable).limit(1);
  if (existing.length === 0) {
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD;
    if (!initialPassword || initialPassword.length < 12) {
      throw new Error("Set ADMIN_INITIAL_PASSWORD to a password with at least 12 characters before starting the app.");
    }
    await db.insert(adminSettingsTable).values({
      passwordHash: createHash(initialPassword),
    });
  }
}

ensureAdminExists().catch((err) => console.error("Failed to seed admin settings:", err));

async function ensureScheduleExists() {
  const existing = await db.select().from(availabilityScheduleTable).limit(1);
  if (existing.length === 0) {
    await db.insert(availabilityScheduleTable).values(DEFAULT_SCHEDULE);
  }
}

ensureScheduleExists().catch((err) => console.error("Failed to seed schedule:", err));

async function ensureLocationExists() {
  const existing = await db.select().from(locationSettingsTable).limit(1);
  if (existing.length === 0) {
    await db.insert(locationSettingsTable).values({
      location: "New York, USA",
      period: "Currently receiving clients",
      isCurrent: true,
      isPublished: true,
      sortOrder: 0,
    });
  }
}

ensureLocationExists().catch((err) => console.error("Failed to seed location settings:", err));

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  if (!isValidToken(token)) {
    res.status(401).json({ error: "Session expired or invalid" });
    return;
  }
  next();
}

router.post("/admin/login", async (req, res) => {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: "Password required" });
    return;
  }
  try {
    const [settings] = await db.select().from(adminSettingsTable).limit(1);
    if (!settings) {
      res.status(500).json({ error: "Admin not configured" });
      return;
    }
    if (!verifyPassword(password, settings.passwordHash)) {
      res.status(401).json({ error: "Incorrect password" });
      return;
    }
    const token = generateToken();
    activeSessions.set(token, Date.now());
    res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/logout", requireAuth, (req, res) => {
  const auth = req.headers.authorization!;
  const token = auth.slice(7);
  activeSessions.delete(token);
  res.json({ ok: true });
});

router.post("/admin/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword required" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }
  try {
    const [settings] = await db.select().from(adminSettingsTable).limit(1);
    if (!settings || !verifyPassword(currentPassword, settings.passwordHash)) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
    await db
      .update(adminSettingsTable)
      .set({ passwordHash: createHash(newPassword) })
      .where(eq(adminSettingsTable.id, settings.id));
    activeSessions.clear();
    res.json({ ok: true });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/bookings", requireAuth, async (_req, res) => {
  try {
    const bookings = await db
      .select()
      .from(bookingsTable)
      .orderBy(bookingsTable.date, bookingsTable.time);
    res.json(bookings);
  } catch (err) {
    console.error("Admin bookings error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/admin/bookings/:id", requireAuth, async (req, res) => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }
  try {
    const [deleted] = await db
      .delete(bookingsTable)
      .where(eq(bookingsTable.id, id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    res.json(deleted);
  } catch (err) {
    console.error("Delete booking error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/admin/bookings/:id/status", requireAuth, async (req, res) => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const status = (req.body as { status?: unknown }).status;
  if (!Number.isInteger(id) || !["confirmed", "declined"].includes(String(status))) {
    res.status(400).json({ error: "Valid booking ID and status are required" });
    return;
  }
  try {
    const [updated] = await db
      .update(bookingsTable)
      .set({ status: String(status), reviewedAt: new Date() })
      .where(eq(bookingsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Unable to update booking" });
  }
});

router.get("/admin/schedule", requireAuth, async (_req, res) => {
  try {
    const schedule = await db
      .select()
      .from(availabilityScheduleTable)
      .orderBy(availabilityScheduleTable.dayOfWeek);
    res.json(schedule);
  } catch (err) {
    console.error("Get schedule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/admin/schedule", requireAuth, async (req, res) => {
  const updates = req.body as Array<{ dayOfWeek: number; isActive: boolean; timeSlots: string[] }>;
  const validSchedule =
    Array.isArray(updates) &&
    updates.length === 7 &&
    new Set(updates.map((day) => day.dayOfWeek)).size === 7 &&
    updates.every(
      (day) =>
        Number.isInteger(day.dayOfWeek) &&
        day.dayOfWeek >= 0 &&
        day.dayOfWeek <= 6 &&
        typeof day.isActive === "boolean" &&
        Array.isArray(day.timeSlots) &&
        day.timeSlots.every((slot) => SLOT_PATTERN.test(slot)),
    );
  if (!validSchedule) {
    res.status(400).json({ error: "Expected array of 7 day schedules" });
    return;
  }
  try {
    for (const day of updates) {
      await db
        .update(availabilityScheduleTable)
        .set({ isActive: day.isActive, timeSlots: day.isActive ? day.timeSlots : [] })
        .where(eq(availabilityScheduleTable.dayOfWeek, day.dayOfWeek));
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Update schedule error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/availability-overrides", requireAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(availabilityOverridesTable)
    .orderBy(asc(availabilityOverridesTable.startDate), asc(availabilityOverridesTable.id));
  res.json(rows);
});

router.post("/admin/availability-overrides", requireAuth, async (req, res) => {
  const body = req.body as Record<string, unknown>;
  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" ? body.endDate : "";
  const isOpen = body.isOpen === true;
  const timeSlots = Array.isArray(body.timeSlots)
    ? body.timeSlots.filter((slot): slot is string => typeof slot === "string")
    : [];
  if (
    !isValidDate(startDate) ||
    !isValidDate(endDate) ||
    endDate < startDate ||
    timeSlots.some((slot) => !SLOT_PATTERN.test(slot))
  ) {
    res.status(400).json({ error: "Valid date range and time slots are required" });
    return;
  }
  const [created] = await db
    .insert(availabilityOverridesTable)
    .values({
      startDate,
      endDate,
      isOpen,
      timeSlots: isOpen ? timeSlots : [],
      label: typeof body.label === "string" ? body.label.trim().slice(0, 120) || null : null,
    })
    .returning();
  res.status(201).json(created);
});

router.delete("/admin/availability-overrides/:id", requireAuth, async (req, res) => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid override ID" });
    return;
  }
  const [deleted] = await db
    .delete(availabilityOverridesTable)
    .where(eq(availabilityOverridesTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Availability exception not found" });
    return;
  }
  res.json(deleted);
});

router.get("/admin/locations", requireAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(locationSettingsTable)
    .orderBy(asc(locationSettingsTable.sortOrder), asc(locationSettingsTable.id));
  res.json(rows);
});

function parseLocation(body: unknown) {
  const value = body as Record<string, unknown>;
  const location = typeof value.location === "string" ? value.location.trim() : "";
  if (!location || location.length > 160) return null;
  return {
    location,
    period: typeof value.period === "string" ? value.period.trim().slice(0, 160) || null : null,
    isCurrent: value.isCurrent === true,
    isPublished: value.isPublished !== false,
    sortOrder: Number.isInteger(value.sortOrder) ? Number(value.sortOrder) : 0,
    updatedAt: new Date(),
  };
}

router.post("/admin/locations", requireAuth, async (req, res) => {
  const values = parseLocation(req.body);
  if (!values) {
    res.status(400).json({ error: "Location is required" });
    return;
  }
  const [created] = await db.insert(locationSettingsTable).values(values).returning();
  res.status(201).json(created);
});

router.put("/admin/locations/:id", requireAuth, async (req, res) => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const values = parseLocation(req.body);
  if (!Number.isInteger(id) || !values) {
    res.status(400).json({ error: "Valid location is required" });
    return;
  }
  const [updated] = await db
    .update(locationSettingsTable)
    .set(values)
    .where(eq(locationSettingsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  res.json(updated);
});

router.delete("/admin/locations/:id", requireAuth, async (req, res) => {
  const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid location ID" });
    return;
  }
  const [deleted] = await db
    .delete(locationSettingsTable)
    .where(eq(locationSettingsTable.id, id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Location not found" });
    return;
  }
  res.json(deleted);
});

router.get("/admin/verify", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

export default router;
