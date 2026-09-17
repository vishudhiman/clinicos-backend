import type { Notification, Patient, Appointment, Doctor } from "@prisma/client";

export type AppointmentWithRelations = Appointment & { doctor: Doctor; patient: Patient };

export interface ChannelSendResult {
  success: boolean;
  error?: string;
}

/**
 * Every delivery channel (email today; WhatsApp / AI voice later) implements this and
 * nothing else. Adding a channel means adding a file here and registering it in
 * notificationService's CHANNELS map — appointment/scheduling logic never changes.
 */
export interface NotificationChannelHandler {
  send(notification: Notification, patient: Patient): Promise<ChannelSendResult>;
}
