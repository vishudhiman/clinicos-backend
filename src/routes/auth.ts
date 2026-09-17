import { Elysia, t } from "elysia";
import bcrypt from "bcryptjs";
import { prisma } from "../db.js";
import {
  registerSchema,
  loginSchema,
  oauthUpsertSchema,
  updateProfileSchema,
} from "../schemas/auth.js";

function toSafeUser(user: {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  doctorId: string | null;
  patientId: string | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    doctorId: user.doctorId,
    patientId: user.patientId,
  };
}

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post(
    "/register",
    async ({ body, set }) => {
      const parsed = registerSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }
      const { name, email, password, role, specialty } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        set.status = 409;
        return { error: "An account with this email already exists." };
      }

      const passwordHash = await bcrypt.hash(password, 12);

      try {
        const user = await prisma.$transaction(async (tx) => {
          if (role === "DOCTOR") {
            const clinic = await tx.clinic.findFirst();
            if (!clinic) {
              throw new Error("No clinic exists yet. Ask an admin to set one up first.");
            }
            const doctor = await tx.doctor.create({
              data: { clinicId: clinic.id, name, specialty: specialty || "General" },
            });
            return tx.user.create({
              data: { name, email, passwordHash, role, doctorId: doctor.id },
            });
          }

          const patient = await tx.patient.create({ data: { name, email } });
          return tx.user.create({
            data: { name, email, passwordHash, role, patientId: patient.id },
          });
        });

        return toSafeUser(user);
      } catch (err) {
        set.status = 400;
        return { error: (err as Error).message };
      }
    },
    { body: t.Any() }
  )
  .post(
    "/login",
    async ({ body, set }) => {
      const parsed = loginSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }
      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) {
        set.status = 401;
        return { error: "Invalid email or password." };
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        set.status = 401;
        return { error: "Invalid email or password." };
      }

      return toSafeUser(user);
    },
    { body: t.Any() }
  )
  .post(
    "/oauth",
    async ({ body, set }) => {
      const parsed = oauthUpsertSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }
      const { email, name } = parsed.data;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return toSafeUser(existing);
      }

      // Self-service OAuth sign-up is always a patient account, same as the credentials path.
      const user = await prisma.$transaction(async (tx) => {
        const patient = await tx.patient.create({ data: { name: name ?? "Patient", email } });
        return tx.user.create({
          data: { name: name ?? "Patient", email, role: "PATIENT", patientId: patient.id },
        });
      });

      return toSafeUser(user);
    },
    { body: t.Any() }
  )
  .get("/profile", async ({ query, set }) => {
    if (!query.patientId) {
      set.status = 400;
      return { error: "patientId is required" };
    }
    const patient = await prisma.patient.findUnique({ where: { id: query.patientId } });
    if (!patient) {
      set.status = 404;
      return { error: "Profile not found" };
    }
    return {
      name: patient.name,
      email: patient.email,
      phoneNumber: patient.phoneNumber,
      memberSince: patient.createdAt,
    };
  }, { query: t.Object({ patientId: t.Optional(t.String()) }) })
  .patch(
    "/profile",
    async ({ body, set }) => {
      const parsed = updateProfileSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }
      try {
        const patient = await prisma.patient.update({
          where: { id: parsed.data.patientId },
          data: { name: parsed.data.name, phoneNumber: parsed.data.phoneNumber || null },
        });
        return {
          name: patient.name,
          email: patient.email,
          phoneNumber: patient.phoneNumber,
          memberSince: patient.createdAt,
        };
      } catch {
        set.status = 409;
        return { error: "That phone number is already in use by another account." };
      }
    },
    { body: t.Any() }
  );
