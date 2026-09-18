import { google } from "googleapis";
import { decrypt } from "../../lib/tokenCrypto.js";
import type { AppointmentWithRelations } from "../notifications/types.js";
import type { CalendarProvider, DoctorCalendarAccountLike } from "./types.js";

function oauthClientFor(account: DoctorCalendarAccountLike) {
  const client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  client.setCredentials({ refresh_token: decrypt(account.refreshToken) });
  return client;
}

function calendarFor(account: DoctorCalendarAccountLike) {
  return google.calendar({ version: "v3", auth: oauthClientFor(account) });
}

function eventPayload(appointment: AppointmentWithRelations) {
  return {
    summary: `${appointment.patient.name} — Dr. ${appointment.doctor.name}`,
    description: appointment.notes ?? `Booked via ClinicOS (${appointment.doctor.specialty}).`,
    start: { dateTime: appointment.startTime.toISOString() },
    end: { dateTime: appointment.endTime.toISOString() },
  };
}

function isGone(err: unknown): boolean {
  const status = (err as { response?: { status?: number }; code?: number | string })?.response?.status;
  return status === 404 || status === 410;
}

export class GoogleCalendarProvider implements CalendarProvider {
  async createEvent(account: DoctorCalendarAccountLike, appointment: AppointmentWithRelations): Promise<string> {
    const { data } = await calendarFor(account).events.insert({
      calendarId: account.googleCalendarId,
      requestBody: eventPayload(appointment),
    });
    if (!data.id) throw new Error("Google Calendar did not return an event id.");
    return data.id;
  }

  async updateEvent(
    account: DoctorCalendarAccountLike,
    eventId: string,
    appointment: AppointmentWithRelations
  ): Promise<void> {
    await calendarFor(account).events.patch({
      calendarId: account.googleCalendarId,
      eventId,
      requestBody: eventPayload(appointment),
    });
  }

  async deleteEvent(account: DoctorCalendarAccountLike, eventId: string): Promise<void> {
    try {
      await calendarFor(account).events.delete({ calendarId: account.googleCalendarId, eventId });
    } catch (err) {
      if (isGone(err)) return; // already deleted on the Google side — nothing to do
      throw err;
    }
  }
}
