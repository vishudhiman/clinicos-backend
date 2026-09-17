import { Elysia, t } from "elysia";
import { prisma } from "../db.js";
import { updateClinicSchema } from "../schemas/api.js";
import { authGuard } from "../middleware/auth.js";

export const clinicRoutes = new Elysia({ prefix: "/clinic" })
  .use(authGuard)
  .get("/", async ({ set }) => {
    const clinic = await prisma.clinic.findFirst();
    if (!clinic) {
      set.status = 404;
      return { error: "No clinic found" };
    }
    return clinic;
  })
  .patch(
    "/",
    async ({ body, user, set }) => {
      if (user!.role !== "ADMIN" && user!.role !== "DOCTOR") {
        set.status = 403;
        return { error: "Forbidden" };
      }
      const parsed = updateClinicSchema.safeParse(body);
      if (!parsed.success) {
        set.status = 400;
        return { error: parsed.error.flatten() };
      }

      const clinic = await prisma.clinic.findFirst();
      if (!clinic) {
        set.status = 404;
        return { error: "No clinic found" };
      }

      return prisma.clinic.update({ where: { id: clinic.id }, data: parsed.data });
    },
    { body: t.Any() }
  );
