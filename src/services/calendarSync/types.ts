import type { AppointmentWithRelations } from "../notifications/types.js";

export interface DoctorCalendarAccountLike {
  doctorId: string;
  googleCalendarId: string;
  /** AES-256-GCM encrypted — providers must decrypt before use (see lib/tokenCrypto.ts). */
  refreshToken: string;
}

/**
 * Everything that talks to an external calendar (Google today; others later, same idea
 * as NotificationChannelHandler) implements this and nothing else — calendarSyncService
 * and scheduling.ts never need to change when a new provider is added.
 */
export interface CalendarProvider {
  createEvent(account: DoctorCalendarAccountLike, appointment: AppointmentWithRelations): Promise<string>;
  updateEvent(
    account: DoctorCalendarAccountLike,
    eventId: string,
    appointment: AppointmentWithRelations
  ): Promise<void>;
  deleteEvent(account: DoctorCalendarAccountLike, eventId: string): Promise<void>;
}
