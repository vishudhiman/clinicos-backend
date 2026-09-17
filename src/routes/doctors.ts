import { Elysia, t } from "elysia";
import { prisma } from "../db.js";
import { findAvailableSlots } from "../services/scheduling.js";
import { createDoctorSchema, updateDoctorSchema } from "../schemas/api.js";

export const doctorsRoutes = new Elysia({ prefix: "/doctors" })
  .get("/", async () => {
    return prisma.doctor.findMany({ include: { schedules: true } });
  })
  .get("/:id", async ({ params, set }) => {
    const doctor = await prisma.doctor.findUnique({
      where: { id: params.id },
      include: { schedules: true },
    });
    if (!doctor) {
      set.status = 404;
      return { error: "Doctor not found" };
    }
    return doctor;
  })
  .get(
    "/:id/availability",
    async ({ params, query, set }) => {
      const date = query.date ? new Date(query.date) : new Date();
      if (Number.isNaN(date.getTime())) {
        set.status = 400;
        return { error: "Invalid date" };
      }
      const slots = await findAvailableSlots(params.id, date);
      return { doctorId: params.id, date: date.toISOString().slice(0, 10), slots };
    },
    { query: t.Object({ date: t.Optional(t.String()) }) }
  )
  .post(
    "/",
    async ({ body, set }) => {
      const parsed = createDoctorSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }

      let clinicId = parsed.data.clinicId;
      if (!clinicId) {
        const clinic = await prisma.clinic.findFirst();
        if (!clinic) {
          set.status = 400;
          return { error: "No clinic exists yet. Create a clinic first." };
        }
        clinicId = clinic.id;
      }

      const doctor = await prisma.doctor.create({
        data: {
          clinicId,
          name: parsed.data.name,
          specialty: parsed.data.specialty,
          bio: parsed.data.bio,
          schedules: { create: parsed.data.schedules },
        },
        include: { schedules: true },
      });

      return doctor;
    },
    { body: t.Any() }
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      const parsed = updateDoctorSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }

      const existing = await prisma.doctor.findUnique({ where: { id: params.id } });
      if (!existing) {
        set.status = 404;
        return { error: "Doctor not found" };
      }

      const { schedules, ...rest } = parsed.data;

      const doctor = await prisma.$transaction(async (tx) => {
        if (schedules) {
          await tx.doctorSchedule.deleteMany({ where: { doctorId: params.id } });
        }
        return tx.doctor.update({
          where: { id: params.id },
          data: {
            ...rest,
            ...(schedules ? { schedules: { create: schedules } } : {}),
          },
          include: { schedules: true },
        });
      });

      return doctor;
    },
    { body: t.Any() }
  );
