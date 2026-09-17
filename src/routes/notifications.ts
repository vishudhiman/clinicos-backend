import { Elysia, t } from "elysia";
import { prisma } from "../db.js";

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })
  .get(
    "/",
    async ({ query, set }) => {
      if (!query.patientId) {
        set.status = 400;
        return { error: "patientId is required" };
      }
      return prisma.notification.findMany({
        where: { patientId: query.patientId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    },
    { query: t.Object({ patientId: t.Optional(t.String()) }) }
  )
  .post("/:id/read", async ({ params, set }) => {
    try {
      return await prisma.notification.update({
        where: { id: params.id },
        data: { readAt: new Date() },
      });
    } catch {
      set.status = 404;
      return { error: "Notification not found" };
    }
  })
  .post(
    "/read-all",
    async ({ body, set }) => {
      const { patientId } = body as { patientId?: string };
      if (!patientId) {
        set.status = 400;
        return { error: "patientId is required" };
      }
      await prisma.notification.updateMany({
        where: { patientId, readAt: null },
        data: { readAt: new Date() },
      });
      return { ok: true };
    },
    { body: t.Any() }
  );
