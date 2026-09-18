import { createHmac, timingSafeEqual } from "node:crypto";
import { Elysia, t } from "elysia";
import { prisma } from "../db.js";
import { runOrchestratorTurn } from "../agents/orchestrator.js";
import { toLangchainHistory } from "../agents/history.js";
import { sendText, markAsRead } from "../services/whatsapp/whatsappProvider.js";

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET;

interface InboundMessage {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string } }>;
        messages?: InboundMessage[];
      };
    }>;
  }>;
}

/**
 * Meta signs every webhook delivery with HMAC-SHA256 over the raw body, using the app
 * secret. Verifying it stops anyone from POSTing fake "patient" messages straight at this
 * endpoint (no other auth is possible here — it's a public URL Meta calls). Optional
 * because it requires setting up a Meta app secret; skipped (with a loud warning) so the
 * sandbox test flow works before that's configured.
 */
function hasValidSignature(rawBody: string, header: string | null): boolean {
  if (!WHATSAPP_APP_SECRET) return true;
  if (!header) return false;

  const expected = "sha256=" + createHmac("sha256", WHATSAPP_APP_SECRET).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(header);
  return expectedBuf.length === receivedBuf.length && timingSafeEqual(expectedBuf, receivedBuf);
}

async function getOrCreatePatientByPhone(phoneNumber: string, contactName?: string) {
  return prisma.patient.upsert({
    where: { phoneNumber },
    update: {},
    create: { name: contactName?.trim() || phoneNumber, phoneNumber },
  });
}

/** One long-running conversation per patient regardless of channel — a patient who
 *  starts on the web and continues over WhatsApp (or vice versa) keeps their history. */
async function getOrCreateConversation(patientId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { patientId },
    orderBy: { createdAt: "desc" },
  });
  return existing ?? prisma.conversation.create({ data: { patientId } });
}

// Mirrors POST /chat in routes/chat.ts exactly — same patient/conversation/message
// bookkeeping, same runOrchestratorTurn call. Only the transport differs: a WhatsApp
// reply is sent out via the Cloud API instead of returned as an HTTP response body.
async function handleInboundMessage(message: InboundMessage, contactName?: string) {
  if (message.type !== "text" || !message.text?.body) return; // MVP is text-only, same as the web chat

  const patient = await getOrCreatePatientByPhone(message.from, contactName);
  const conversation = await getOrCreateConversation(patient.id);

  const priorMessages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.create({
    data: { conversationId: conversation.id, role: "PATIENT", content: message.text.body },
  });

  markAsRead(message.id).catch((err) => console.error("[whatsapp] markAsRead failed:", err));

  const agentResult = await runOrchestratorTurn({
    patientId: patient.id,
    message: message.text.body,
    history: toLangchainHistory(priorMessages),
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "AI",
      content: agentResult.reply,
      detectedIntent: agentResult.intent,
    },
  });

  await sendText(message.from, agentResult.reply);
}

export const whatsappRoutes = new Elysia({ prefix: "/whatsapp" })
  .get(
    "/webhook",
    ({ query, set }) => {
      const isSubscribe = query["hub.mode"] === "subscribe";
      const tokenMatches = Boolean(WHATSAPP_VERIFY_TOKEN) && query["hub.verify_token"] === WHATSAPP_VERIFY_TOKEN;
      if (isSubscribe && tokenMatches) {
        set.status = 200;
        return query["hub.challenge"] ?? "";
      }
      set.status = 403;
      return "Forbidden";
    },
    {
      query: t.Object({
        "hub.mode": t.Optional(t.String()),
        "hub.verify_token": t.Optional(t.String()),
        "hub.challenge": t.Optional(t.String()),
      }),
    }
  )
  .post("/webhook", async ({ request, set }) => {
    const rawBody = await request.text();

    if (!hasValidSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      set.status = 401;
      return { error: "Invalid signature" };
    }

    // Ack immediately — Meta retries aggressively on a slow or non-2xx response, and the
    // actual reply to the patient goes out separately via sendText(), not this response.
    set.status = 200;

    let payload: WhatsAppWebhookBody;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { received: true };
    }

    const value = payload.entry?.[0]?.changes?.[0]?.value;
    const messages = value?.messages ?? [];
    const contactName = value?.contacts?.[0]?.profile?.name;

    for (const message of messages) {
      handleInboundMessage(message, contactName).catch((err) =>
        console.error("[whatsapp] failed to handle inbound message:", err)
      );
    }

    return { received: true };
  });
