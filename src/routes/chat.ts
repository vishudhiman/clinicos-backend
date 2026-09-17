import { Elysia, t } from "elysia";
import { prisma } from "../db.js";
import { chatRequestSchema } from "../schemas/api.js";
import { runAgentTurn, toLangchainHistory } from "../agents/appointmentAgent.js";
import { authGuard } from "../middleware/auth.js";

export const chatRoutes = new Elysia().use(authGuard).post(
  "/chat",
  async ({ body, user, set }) => {
    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return { error: parsed.error.flatten() };
    }
    if (user!.role !== "PATIENT" || !user!.patientId) {
      set.status = 403;
      return { error: "Forbidden" };
    }
    const patientId = user!.patientId;
    const { message } = parsed.data;

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      set.status = 404;
      return { error: "Patient not found" };
    }

    const conversation = parsed.data.conversationId
      ? await prisma.conversation.findUnique({ where: { id: parsed.data.conversationId } })
      : await prisma.conversation.create({ data: { patientId } });

    if (!conversation || conversation.patientId !== patientId) {
      set.status = 404;
      return { error: "Conversation not found" };
    }

    const priorMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });

    await prisma.message.create({
      data: { conversationId: conversation.id, role: "PATIENT", content: message },
    });

    let agentResult;
    try {
      agentResult = await runAgentTurn({
        patientId,
        message,
        history: toLangchainHistory(priorMessages),
      });
    } catch (err) {
      set.status = 502;
      return { error: `Agent error: ${(err as Error).message}` };
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "AI",
        content: agentResult.reply,
        detectedIntent: agentResult.intent,
      },
    });

    return {
      conversationId: conversation.id,
      reply: agentResult.reply,
      intent: agentResult.intent,
    };
  },
  { body: t.Any() }
);
