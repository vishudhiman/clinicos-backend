import { z } from "zod";

export const createAppointmentSchema = z.object({
  doctorId: z.string(),
  patientId: z.string(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  notes: z.string().optional(),
});

export const rescheduleAppointmentSchema = z.object({
  newStartTime: z.coerce.date(),
  newEndTime: z.coerce.date(),
});

export const chatRequestSchema = z.object({
  conversationId: z.string().optional(),
  patientId: z.string(),
  message: z.string().min(1),
});

export const doctorScheduleInputSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  slotMinutes: z.number().int().min(5).max(240).default(30),
});

export const createDoctorSchema = z.object({
  clinicId: z.string().optional(),
  name: z.string().min(1),
  specialty: z.string().min(1),
  bio: z.string().optional(),
  schedules: z.array(doctorScheduleInputSchema).default([]),
});

export const updateDoctorSchema = z.object({
  name: z.string().min(1).optional(),
  specialty: z.string().min(1).optional(),
  bio: z.string().optional(),
  schedules: z.array(doctorScheduleInputSchema).optional(),
});

export const updateClinicSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});
