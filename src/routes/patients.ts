import { Elysia, t } from "elysia";
import { prisma } from "../db.js";
import { authGuard } from "../middleware/auth.js";

export const patientsRoutes = new Elysia({ prefix: "/patients" }).use(authGuard).post(
  "/",
  async ({ body, user, set }) => {
    if (user!.role !== "ADMIN" && user!.role !== "DOCTOR") {
      set.status = 403;
      return { error: "Forbidden" };
    }
    const { name, phoneNumber } = body as { name: string; phoneNumber: string };
    if (!name?.trim() || !phoneNumber?.trim()) {
      set.status = 400;
      return { error: "name and phoneNumber are required" };
    }

    const patient = await prisma.patient.upsert({
      where: { phoneNumber },
      update: { name },
      create: { name, phoneNumber },
    });

    return patient;
  },
  { body: t.Object({ name: t.String(), phoneNumber: t.String() }) }
);
