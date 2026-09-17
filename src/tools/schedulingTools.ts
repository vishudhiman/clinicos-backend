import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  bookAppointment,
  cancelAppointment,
  findAvailableSlots,
  rescheduleAppointment,
  getAppointment,
} from "../services/scheduling.js";
import { findDoctorByName, getSlotMinutesForDoctorOnDay } from "../services/clinicInfo.js";

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

export const findAvailableSlotsTool = tool(
  async ({ doctorName, date }) => {
    const doctor = await findDoctorByName(doctorName);
    if (!doctor) {
      return JSON.stringify({ error: `No doctor found matching "${doctorName}".` });
    }
    const slots = await findAvailableSlots(doctor.id, new Date(date));
    return JSON.stringify({
      doctorId: doctor.id,
      doctorName: doctor.name,
      slots: slots.map((s) => ({ iso: s.startTime.toISOString(), label: formatSlot(s.startTime) })),
    });
  },
  {
    name: "find_available_slots",
    description:
      "Find real available appointment slots for a doctor on a given date. Always call this before telling a patient what times are available. Never invent availability.",
    schema: z.object({
      doctorName: z.string().describe("The doctor's name, e.g. 'Dr. Sharma'"),
      date: z.string().describe("ISO date (YYYY-MM-DD) to check availability for"),
    }),
  }
);

export const bookAppointmentTool = tool(
  async ({ doctorName, patientId, startTimeIso }) => {
    const doctor = await findDoctorByName(doctorName);
    if (!doctor) {
      return JSON.stringify({ error: `No doctor found matching "${doctorName}".` });
    }
    const startTime = new Date(startTimeIso);
    const slotMinutes = await getSlotMinutesForDoctorOnDay(doctor.id, startTime.getDay());
    const endTime = new Date(startTime.getTime() + slotMinutes * 60 * 1000);

    try {
      const appointment = await bookAppointment({
        doctorId: doctor.id,
        patientId,
        startTime,
        endTime,
      });
      return JSON.stringify({
        appointmentId: appointment.id,
        doctorName: doctor.name,
        startTime: formatSlot(appointment.startTime),
        status: appointment.status,
      });
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment for a patient with a doctor at a specific start time (ISO datetime). Only call this after the patient has confirmed a specific slot returned by find_available_slots.",
    schema: z.object({
      doctorName: z.string(),
      patientId: z.string(),
      startTimeIso: z.string().describe("ISO datetime of the chosen slot"),
    }),
  }
);

export const cancelAppointmentTool = tool(
  async ({ appointmentId }) => {
    try {
      const appointment = await cancelAppointment(appointmentId);
      return JSON.stringify({ appointmentId: appointment.id, status: appointment.status });
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
  {
    name: "cancel_appointment",
    description: "Cancel an existing appointment by its id.",
    schema: z.object({ appointmentId: z.string() }),
  }
);

export const rescheduleAppointmentTool = tool(
  async ({ appointmentId, newStartTimeIso }) => {
    try {
      const existing = await getAppointment(appointmentId);
      if (!existing) {
        return JSON.stringify({ error: "Appointment not found." });
      }
      const duration = existing.endTime.getTime() - existing.startTime.getTime();
      const newStartTime = new Date(newStartTimeIso);
      const newEndTime = new Date(newStartTime.getTime() + duration);
      const appointment = await rescheduleAppointment({
        appointmentId,
        newStartTime,
        newEndTime,
      });
      return JSON.stringify({
        appointmentId: appointment.id,
        newStartTime: formatSlot(appointment.startTime),
        status: appointment.status,
      });
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  },
  {
    name: "reschedule_appointment",
    description:
      "Reschedule an existing appointment to a new start time (ISO datetime). Confirm the new slot is what the patient wants first.",
    schema: z.object({
      appointmentId: z.string(),
      newStartTimeIso: z.string(),
    }),
  }
);

export const getAppointmentStatusTool = tool(
  async ({ appointmentId }) => {
    const appointment = await getAppointment(appointmentId);
    if (!appointment) {
      return JSON.stringify({ error: "Appointment not found." });
    }
    return JSON.stringify({
      appointmentId: appointment.id,
      doctorName: appointment.doctor.name,
      startTime: formatSlot(appointment.startTime),
      status: appointment.status,
    });
  },
  {
    name: "get_appointment_status",
    description: "Look up the status and details of an existing appointment by its id.",
    schema: z.object({ appointmentId: z.string() }),
  }
);

export const schedulingTools = [
  findAvailableSlotsTool,
  bookAppointmentTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
  getAppointmentStatusTool,
];
