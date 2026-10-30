import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bookingsTable } from "@workspace/db/schema";
import { getEffectiveSlots, isPastDate, isValidDate, SLOT_PATTERN } from "../lib/availability";
const router: IRouter = Router();

type CreateBookingInput = {
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  serviceId: "temple-attunement" | "reiki-plus";
  date: string;
  time: string;
  notes?: string;
};

function parseBookingInput(body: unknown): CreateBookingInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const clientName = typeof value.clientName === "string" ? value.clientName.trim() : "";
  const clientEmail = typeof value.clientEmail === "string" ? value.clientEmail.trim() : "";
  const serviceId = value.serviceId;
  const date = typeof value.date === "string" ? value.date : "";
  const time = typeof value.time === "string" ? value.time : "";
  if (
    clientName.length < 2 ||
    clientName.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail) ||
    clientEmail.length > 254 ||
    (serviceId !== "temple-attunement" && serviceId !== "reiki-plus") ||
    !isValidDate(date) ||
    isPastDate(date) ||
    !SLOT_PATTERN.test(time)
  ) return null;
  const clientPhone = typeof value.clientPhone === "string" ? value.clientPhone.trim() : undefined;
  const notes = typeof value.notes === "string" ? value.notes.trim() : undefined;
  if ((clientPhone?.length ?? 0) > 40 || (notes?.length ?? 0) > 2000) return null;
  return { clientName, clientEmail, clientPhone, serviceId, date, time, notes };
}

const SERVICE_NAMES: Record<string, string> = {
  "temple-attunement": "Temple Attunement",
  "reiki-plus": "Reiki+",
};

router.post("/bookings", async (req, res) => {
  const body = parseBookingInput(req.body);
  if (!body) {
    res.status(400).json({ error: "Please provide valid appointment details" });
    return;
  }
  const availableSlots = await getEffectiveSlots(body.date);
  if (!availableSlots.includes(body.time)) {
    res.status(409).json({ error: "This time is no longer available. Please choose another slot." });
    return;
  }

  const serviceName = SERVICE_NAMES[body.serviceId] ?? body.serviceId;

  try {
    const [booking] = await db
      .insert(bookingsTable)
      .values({
        clientName: body.clientName,
        clientEmail: body.clientEmail,
        clientPhone: body.clientPhone || null,
        serviceId: body.serviceId,
        serviceName,
        date: body.date,
        time: body.time,
        notes: body.notes || null,
        status: "pending",
      })
      .returning();
    res.status(201).json(booking);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "This time slot was just requested. Please choose another time." });
      return;
    }
    res.status(500).json({ error: "Unable to submit appointment request" });
  }
});

export default router;
