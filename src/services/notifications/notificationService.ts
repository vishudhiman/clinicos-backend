import type { NotificationChannel, NotificationType } from "@prisma/client";
import { prisma } from "../../db.js";
import { EmailChannel } from "./channels/email.js";
import { InAppChannel } from "./channels/inApp.js";
import { buildNotificationContent } from "./templates.js";
import type { AppointmentWithRelations, NotificationChannelHandler } from "./types.js";

// Registering a new channel (WhatsApp, AI voice, ...) is a one-line addition here —
// nothing in scheduling.ts or the appointment routes needs to change.
const CHANNELS: Record<NotificationChannel, NotificationChannelHandler> = {
  EMAIL: new EmailChannel(),
  IN_APP: new InAppChannel(),
};

const REMINDER_OFFSETS_MS: [NotificationType, number][] = [
  ["REMINDER_24H", 24 * 60 * 60 * 1000],
  ["REMINDER_1H", 60 * 60 * 1000],
];

export async function dispatchNotification(notificationId: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    include: { patient: true },
  });
  if (!notification || notification.status !== "PENDING") return;

  const handler = CHANNELS[notification.channel];
  const result = await handler.send(notification, notification.patient);

  await prisma.notification.update({
    where: { id: notification.id },
    data: result.success
      ? { status: "SENT", sentAt: new Date() }
      : { status: "FAILED", error: result.error },
  });
}

async function createAndDispatch(
  appointment: AppointmentWithRelations,
  type: NotificationType,
  channels: NotificationChannel[]
) {
  const { title, message } = buildNotificationContent(type, appointment);
  for (const channel of channels) {
    const notification = await prisma.notification.create({
      data: { patientId: appointment.patientId, appointmentId: appointment.id, type, channel, title, message },
    });
    await dispatchNotification(notification.id);
  }
}

export function sendBookingConfirmation(appointment: AppointmentWithRelations) {
  return createAndDispatch(appointment, "BOOKING_CONFIRMATION", ["EMAIL", "IN_APP"]);
}

export function sendCancellationNotice(appointment: AppointmentWithRelations) {
  return createAndDispatch(appointment, "CANCELLATION", ["EMAIL", "IN_APP"]);
}

export function sendRescheduleNotice(appointment: AppointmentWithRelations) {
  return createAndDispatch(appointment, "RESCHEDULE", ["EMAIL", "IN_APP"]);
}

/**
 * Creates PENDING 24h/1h reminder rows on both channels; the scheduler dispatches them
 * when due. IN_APP is included (not just EMAIL) so reminders still show up in the
 * notification center even when SMTP isn't configured.
 */
export async function scheduleReminders(appointment: AppointmentWithRelations): Promise<void> {
  for (const [type, offsetMs] of REMINDER_OFFSETS_MS) {
    const scheduledFor = new Date(appointment.startTime.getTime() - offsetMs);
    if (scheduledFor <= new Date()) continue;

    const { title, message } = buildNotificationContent(type, appointment);
    for (const channel of ["EMAIL", "IN_APP"] as const) {
      await prisma.notification.create({
        data: {
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          type,
          channel,
          title,
          message,
          scheduledFor,
        },
      });
    }
  }
}

/** Cancels any not-yet-sent reminders for an appointment (call on cancel/reschedule). */
export async function cancelPendingReminders(appointmentId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      appointmentId,
      status: "PENDING",
      type: { in: ["REMINDER_24H", "REMINDER_1H"] },
    },
    data: { status: "SKIPPED" },
  });
}
