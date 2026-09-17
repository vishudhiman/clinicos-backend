import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  bookAppointment,
  cancelAppointment,
  findAvailableSlots,
  rescheduleAppointment,
  getAppointment,
} from "../services/scheduling.js";

async function resolveDoctorByName(name: string) {
  const doctor = await prisma.doctor.findFirst({
    where: { name: { contains: name, mode: "insensitive" } },
  });
  return doctor;
}

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

export const listDoctorsTool = tool(
  async () => {
    const doctors = await prisma.doctor.findMany();
    return JSON.stringify(
      doctors.map((d: any) => ({ id: d.id, name: d.name, specialty: d.specialty, bio: d.bio }))
    );
  },
  {
    name: "list_doctors",
    description:
      "List all doctors at the clinic with their id, name, specialty, and bio. Use this to answer questions about which doctors are available or what they specialize in.",
    schema: z.object({}),
  }
);

export const getDoctorInfoTool = tool(
  async ({ doctorName }) => {
    const doctor = await resolveDoctorByName(doctorName);
    if (!doctor) {
      return JSON.stringify({ error: `No doctor found matching "${doctorName}".` });
    }
    return JSON.stringify({
      name: doctor.name,
      specialty: doctor.specialty,
      bio: doctor.bio ?? "No bio on file.",
    });
  },
  {
    name: "get_doctor_info",
    description:
      "Get a specific doctor's specialty and bio. Use this to answer patient questions like 'what does Dr. X specialize in' or 'tell me about Dr. X'. Never invent details not returned here.",
    schema: z.object({ doctorName: z.string() }),
  }
);

export const getClinicInfoTool = tool(
  async () => {
    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      return JSON.stringify({ error: "No clinic information on file." });
    }
    return JSON.stringify({
      name: clinic.name,
      description: clinic.description ?? "No description on file.",
    });
  },
  {
    name: "get_clinic_info",
    description:
      "Get general information about the clinic itself (name, description). Use this for questions like 'tell me about this clinic'. Never invent details not returned here.",
    schema: z.object({}),
  }
);

export const findAvailableSlotsTool = tool(
  async ({ doctorName, date }) => {
    const doctor = await resolveDoctorByName(doctorName);
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
    const doctor = await resolveDoctorByName(doctorName);
    if (!doctor) {
      return JSON.stringify({ error: `No doctor found matching "${doctorName}".` });
    }
    const startTime = new Date(startTimeIso);
    const schedule = await prisma.doctorSchedule.findFirst({
      where: { doctorId: doctor.id, dayOfWeek: startTime.getDay() },
    });
    const slotMinutes = schedule?.slotMinutes ?? 30;
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
  listDoctorsTool,
  getDoctorInfoTool,
  getClinicInfoTool,
  findAvailableSlotsTool,
  bookAppointmentTool,
  cancelAppointmentTool,
  rescheduleAppointmentTool,
  getAppointmentStatusTool,
];
