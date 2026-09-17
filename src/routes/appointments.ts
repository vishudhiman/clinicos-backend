import { Elysia, t } from "elysia";
import { prisma } from "../db.js";
import {
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  getAppointment,
} from "../services/scheduling.js";
import { createAppointmentSchema, rescheduleAppointmentSchema } from "../schemas/api.js";

export const appointmentsRoutes = new Elysia({ prefix: "/appointments" })
  .get("/", async () => {
    return prisma.appointment.findMany({
      include: { doctor: true, patient: true },
      orderBy: { startTime: "asc" },
    });
  })
  .get("/:id", async ({ params, set }) => {
    const appointment = await getAppointment(params.id);
    if (!appointment) {
      set.status = 404;
      return { error: "Appointment not found" };
    }
    return appointment;
  })
  .post(
    "/",
    async ({ body, set }) => {
      const parsed = createAppointmentSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }
      try {
        return await bookAppointment(parsed.data);
      } catch (err) {
        set.status = 409;
        return { error: (err as Error).message };
      }
    },
    { body: t.Any() }
  )
  .post("/:id/cancel", async ({ params, set }) => {
    try {
      return await cancelAppointment(params.id);
    } catch (err) {
      set.status = 400;
      return { error: (err as Error).message };
    }
  })
  .post(
    "/:id/reschedule",
    async ({ params, body, set }) => {
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
