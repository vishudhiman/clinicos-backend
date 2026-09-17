import type { NotificationType } from "@prisma/client";
import type { AppointmentWithRelations } from "./types.js";

function formatSlot(date: Date): string {
  return date.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}

export function buildNotificationContent(
  type: NotificationType,
  appointment: AppointmentWithRelations
): { title: string; message: string } {
  const when = formatSlot(appointment.startTime);
  const doctor = appointment.doctor.name;

  switch (type) {
    case "BOOKING_CONFIRMATION":
      return {
        title: "Appointment confirmed",
        message: `Your appointment with ${doctor} is confirmed for ${when}.`,
      };
    case "REMINDER_24H":
      return {
        title: "Appointment tomorrow",
        message: `Reminder: you have an appointment with ${doctor} on ${when}.`,
      };
    case "REMINDER_1H":
      return {
        title: "Appointment in 1 hour",
        message: `Reminder: your appointment with ${doctor} is coming up at ${when}.`,
      };
    case "CANCELLATION":
      return {
        title: "Appointment cancelled",
        message: `Your appointment with ${doctor} on ${when} has been cancelled.`,
      };
    case "RESCHEDULE":
      return {
        title: "Appointment rescheduled",
        message: `Your appointment with ${doctor} has been moved to ${when}.`,
      };
  }
}
