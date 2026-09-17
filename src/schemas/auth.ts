import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["PATIENT", "DOCTOR"]),
  specialty: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const oauthUpsertSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

export const updateProfileSchema = z.object({
  patientId: z.string(),
  name: z.string().min(1),
  phoneNumber: z.string().optional(),
});
