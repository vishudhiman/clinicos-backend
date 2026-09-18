import { Elysia, t } from "elysia";
import { prisma } from "../db.js";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  getAppointment,
} from "../services/scheduling.js";
import { createAppointmentSchema, rescheduleAppointmentSchema } from "../schemas/api.js";
import { authGuard } from "../middleware/auth.js";
import type { AuthTokenPayload } from "../lib/jwt.js";

const isStaff = (user: AuthTokenPayload) => user.role === "ADMIN" || user.role === "DOCTOR";

const canAccess = (
  user: AuthTokenPayload,
  appointment: { patientId: string; doctorId: string }
) => isStaff(user) || user.patientId === appointment.patientId || user.doctorId === appointment.doctorId;

export const appointmentsRoutes = new Elysia({ prefix: "/appointments" })
  .use(authGuard)
  .get("/", async ({ user, set }) => {
    if (isStaff(user!)) {
      return prisma.appointment.findMany({
        include: { doctor: true, patient: true },
        orderBy: { startTime: "asc" },
      });
    }
    if (user!.patientId) {
      return prisma.appointment.findMany({
        where: { patientId: user!.patientId },
        include: { doctor: true, patient: true },
        orderBy: { startTime: "asc" },
      });
    }
    set.status = 403;
    return { error: "Forbidden" };
  })
  .get("/:id", async ({ params, user, set }) => {
    const appointment = await getAppointment(params.id);
    if (!appointment || !canAccess(user!, appointment)) {
      set.status = 404;
      return { error: "Appointment not found" };
    }
    return appointment;
  })
  .post(
    "/",
    async ({ body, user, set }) => {
      const parsed = createAppointmentSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }
      const patientId = isStaff(user!) ? parsed.data.patientId : user!.patientId;
      if (!patientId) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      try {
        return await bookAppointment({ ...parsed.data, patientId });
      } catch (err) {
        set.status = 409;
        return { error: (err as Error).message };
      }
    },
    { body: t.Any() }
  )
  .post("/:id/cancel", async ({ params, user, set }) => {
    const appointment = await getAppointment(params.id);
    if (!appointment || !canAccess(user!, appointment)) {
      set.status = 404;
      return { error: "Appointment not found" };
    }
    try {
      return await cancelAppointment(params.id);
    } catch (err) {
      set.status = 400;
      return { error: (err as Error).message };
    }
  })
  .post(
    "/:id/reschedule",
    async ({ params, body, user, set }) => {
      const appointment = await getAppointment(params.id);
      if (!appointment || !canAccess(user!, appointment)) {
        set.status = 404;
        return { error: "Appointment not found" };
      }
      const parsed = rescheduleAppointmentSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }
      try {
        return await rescheduleAppointment({
          appointmentId: params.id,
          newStartTime: parsed.data.newStartTime,
          newEndTime: parsed.data.newEndTime,
        });
      } catch (err) {
        set.status = 409;
        return { error: (err as Error).message };
      }
    },
    { body: t.Any() }
  );
