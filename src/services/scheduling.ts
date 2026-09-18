import { prisma } from "../db.js";
import type { Appointment, AppointmentStatus } from "@prisma/client";
import {
  sendBookingConfirmation,
  sendCancellationNotice,
  sendRescheduleNotice,
  scheduleReminders,
  cancelPendingReminders,
} from "./notifications/notificationService.js";
import type { AppointmentWithRelations } from "./notifications/types.js";
import { syncOnBook, syncOnCancel, syncOnReschedule } from "./calendarSync/calendarSyncService.js";

// Fire-and-forget on purpose: nothing in here — including the relation lookup itself —
// may ever affect the booking/cancel/reschedule result. Both the REST API and the AI
// agent's tools call the functions below, so this is the single place notifications
// hook into the appointment lifecycle.
function notifyInBackground(task: () => Promise<unknown>, label: string) {
  task().catch((err) => console.error(`[notifications] ${label} failed:`, err));
}

async function withRelations(appointmentId: string): Promise<AppointmentWithRelations> {
  return prisma.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { doctor: true, patient: true },
  });
}

const ACTIVE_STATUSES: AppointmentStatus[] = ["PENDING", "CONFIRMED"];

export interface Slot {
  startTime: Date;
  endTime: Date;
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export async function findAvailableSlots(
  doctorId: string,
  date: Date
): Promise<Slot[]> {
  const dayOfWeek = date.getDay();

  const schedules = await prisma.doctorSchedule.findMany({
    where: { doctorId, dayOfWeek },
  });

  if (schedules.length === 0) return [];

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: ACTIVE_STATUSES },
      startTime: { gte: dayStart, lte: dayEnd },
    },
  });

  const slots: Slot[] = [];

  for (const schedule of schedules) {
    const startMinutes = parseTimeToMinutes(schedule.startTime);
    const endMinutes = parseTimeToMinutes(schedule.endTime);

    for (
      let minutes = startMinutes;
      minutes + schedule.slotMinutes <= endMinutes;
      minutes += schedule.slotMinutes
    ) {
      const slotStart = new Date(date);
      slotStart.setHours(0, minutes, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + schedule.slotMinutes * 60 * 1000);

      if (slotStart < new Date()) continue;

      const overlaps = existingAppointments.some(
        (appt) => slotStart < appt.endTime && slotEnd > appt.startTime
      );

      if (!overlaps) {
        slots.push({ startTime: slotStart, endTime: slotEnd });
      }
    }
  }

  return slots;
}

async function assertSlotIsFree(
  doctorId: string,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: string
) {
  const conflict = await prisma.appointment.findFirst({
    where: {
      doctorId,
      status: { in: ACTIVE_STATUSES },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
  });

  if (conflict) {
    throw new Error("Requested slot is no longer available.");
  }
}

export async function bookAppointment(params: {
  doctorId: string;
  patientId: string;
  startTime: Date;
  endTime: Date;
  notes?: string;
}): Promise<Appointment> {
  return prisma.$transaction(async (tx) => {
    // Serializes booking attempts per doctor: under the default READ COMMITTED
    // isolation, two concurrent transactions could both pass the conflict check
    // below before either commits, double-booking the slot. The advisory lock
    // makes the second transaction wait here until the first commits (and
    // releases the lock automatically at transaction end), so its conflict
    // check sees the first transaction's write.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.doctorId}))`;

    const conflict = await tx.appointment.findFirst({
      where: {
        doctorId: params.doctorId,
        status: { in: ACTIVE_STATUSES },
        startTime: { lt: params.endTime },
        endTime: { gt: params.startTime },
      },
    });

    if (conflict) {
      throw new Error("Requested slot is no longer available.");
    }

    return tx.appointment.create({
      data: {
        doctorId: params.doctorId,
        patientId: params.patientId,
        startTime: params.startTime,
        endTime: params.endTime,
        notes: params.notes,
        status: "CONFIRMED",
      },
    });
  }).then((appointment) => {
    notifyInBackground(async () => {
      const full = await withRelations(appointment.id);
      await sendBookingConfirmation(full);
      await scheduleReminders(full);
    }, "booking confirmation/reminders");
    notifyInBackground(async () => {
      const full = await withRelations(appointment.id);
      await syncOnBook(full);
    }, "calendar sync");
    return appointment;
  });
}

export async function cancelAppointment(appointmentId: string): Promise<Appointment> {
  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });
  notifyInBackground(async () => {
    const full = await withRelations(appointment.id);
    await cancelPendingReminders(appointment.id);
    await sendCancellationNotice(full);
  }, "cancellation notice");
  notifyInBackground(async () => {
    const full = await withRelations(appointment.id);
    await syncOnCancel(full);
  }, "calendar sync");
  return appointment;
}

export async function rescheduleAppointment(params: {
  appointmentId: string;
  newStartTime: Date;
  newEndTime: Date;
}): Promise<Appointment> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findUniqueOrThrow({
      where: { id: params.appointmentId },
    });

    // See bookAppointment for why this lock is needed.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${existing.doctorId}))`;

    const conflict = await tx.appointment.findFirst({
      where: {
        doctorId: existing.doctorId,
        status: { in: ACTIVE_STATUSES },
        id: { not: existing.id },
        startTime: { lt: params.newEndTime },
        endTime: { gt: params.newStartTime },
      },
    });

    if (conflict) {
      throw new Error("Requested slot is no longer available.");
    }

    return tx.appointment.update({
      where: { id: existing.id },
      data: { startTime: params.newStartTime, endTime: params.newEndTime },
    });
  }).then((appointment) => {
    notifyInBackground(async () => {
      const full = await withRelations(appointment.id);
      await cancelPendingReminders(appointment.id);
      await scheduleReminders(full);
      await sendRescheduleNotice(full);
    }, "reschedule notifications");
    notifyInBackground(async () => {
      const full = await withRelations(appointment.id);
      await syncOnReschedule(full);
    }, "calendar sync");
    return appointment;
  });
}

export async function getAppointment(appointmentId: string) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: true, patient: true },
  });
}
