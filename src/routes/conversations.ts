import { Elysia } from "elysia";
import { prisma } from "../db.js";
import { authGuard } from "../middleware/auth.js";
import type { AuthTokenPayload } from "../lib/jwt.js";

const isStaff = (user: AuthTokenPayload) => user.role === "ADMIN" || user.role === "DOCTOR";

export const conversationsRoutes = new Elysia({ prefix: "/conversations" })
  .use(authGuard)
  .get("/:id", async ({ params, user, set }) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: { patient: true },
    });
    if (!conversation || (!isStaff(user!) && user!.patientId !== conversation.patientId)) {
      set.status = 404;
      return { error: "Conversation not found" };
    }
    return conversation;
  })
  .get("/:id/messages", async ({ params, user, set }) => {
    const conversation = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!conversation || (!isStaff(user!) && user!.patientId !== conversation.patientId)) {
      set.status = 404;
      return { error: "Conversation not found" };
    }
    return prisma.message.findMany({
      where: { conversationId: params.id },
      orderBy: { createdAt: "asc" },
    });
  });
