import { Elysia, t } from "elysia";
import { prisma } from "../db.js";
import { authGuard } from "../middleware/auth.js";
import type { AuthTokenPayload } from "../lib/jwt.js";

const isStaff = (user: AuthTokenPayload) => user.role === "ADMIN" || user.role === "DOCTOR";
const owns = (user: AuthTokenPayload, patientId: string) => isStaff(user) || user.patientId === patientId;

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })
  .use(authGuard)
  .get(
    "/",
    async ({ query, user, set }) => {
      if (!query.patientId || !owns(user!, query.patientId)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      return prisma.notification.findMany({
        where: { patientId: query.patientId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    },
    { query: t.Object({ patientId: t.Optional(t.String()) }) }
  )
  .post("/:id/read", async ({ params, user, set }) => {
    const existing = await prisma.notification.findUnique({ where: { id: params.id } });
    if (!existing || !owns(user!, existing.patientId)) {
      set.status = 404;
      return { error: "Notification not found" };
    }
    return prisma.notification.update({
      where: { id: params.id },
      data: { readAt: new Date() },
    });
  })
  .post(
    "/read-all",
    async ({ body, user, set }) => {
      const { patientId } = body as { patientId?: string };
      if (!patientId || !owns(user!, patientId)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
      await prisma.notification.updateMany({
        where: { patientId, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true };
    },
    { body: t.Any() }
  );
