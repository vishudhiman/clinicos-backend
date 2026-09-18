import { prisma } from "../../db.js";
import { GoogleCalendarProvider } from "./googleCalendarProvider.js";
import type { AppointmentWithRelations } from "../notifications/types.js";
import type { CalendarProvider } from "./types.js";

// Registering a new provider is a one-line addition here — nothing in scheduling.ts
// or the appointment routes needs to change (same pattern as notificationService's CHANNELS).
const provider: CalendarProvider = new GoogleCalendarProvider();

async function getAccount(doctorId: string) {
  return prisma.doctorCalendarAccount.findUnique({ where: { doctorId } });
}

/** No-op when the doctor hasn't connected a calendar — booking works identically either way. */
export async function syncOnBook(appointment: AppointmentWithRelations): Promise<void> {
  const account = await getAccount(appointment.doctorId);
  if (!account) return;

  const eventId = await provider.createEvent(account, appointment);
  await prisma.appointment.update({ where: { id: appointment.id }, data: { googleEventId: eventId } });
}

export async function syncOnCancel(appointment: AppointmentWithRelations): Promise<void> {
  if (!appointment.googleEventId) return;
  const account = await getAccount(appointment.doctorId);
  if (!account) return;

  await provider.deleteEvent(account, appointment.googleEventId);
}

export async function syncOnReschedule(appointment: AppointmentWithRelations): Promise<void> {
  const account = await getAccount(appointment.doctorId);
  if (!account) return;

  if (appointment.googleEventId) {
    await provider.updateEvent(account, appointment.googleEventId, appointment);
    return;
  }
  // Doctor connected their calendar after this appointment was first booked — create
  // the event now instead of leaving it permanently unsynced.
  const eventId = await provider.createEvent(account, appointment);
  await prisma.appointment.update({ where: { id: appointment.id }, data: { googleEventId: eventId } });
}
