import { Elysia } from "elysia";
import { prisma } from "../db.js";

export const conversationsRoutes = new Elysia({ prefix: "/conversations" })
  .get("/:id", async ({ params, set }) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: { patient: true },
    });
    if (!conversation) {
      set.status = 404;
      return { error: "Conversation not found" };
    }
    return conversation;
  })
  .get("/:id/messages", async ({ params }) => {
    return prisma.message.findMany({
      where: { conversationId: params.id },
      orderBy: { createdAt: "asc" },
    });
  });
