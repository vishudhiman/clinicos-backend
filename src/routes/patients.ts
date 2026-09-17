import { Elysia, t } from "elysia";
import { prisma } from "../db.js";

export const patientsRoutes = new Elysia({ prefix: "/patients" }).post(
  "/",
  async ({ body, set }) => {
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
