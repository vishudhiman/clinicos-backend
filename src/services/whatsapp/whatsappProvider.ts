// Thin wrapper over the WhatsApp Cloud API (Graph API). Swapping WHATSAPP_PHONE_NUMBER_ID
// from Meta's free sandbox test number to a real business number later requires no code
// change here — only the env var.
const GRAPH_API_VERSION = "v21.0";

function isConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`;
}

async function graphPost(body: Record<string, unknown>): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const res = await fetch(graphUrl(`${phoneNumberId}/messages`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`WhatsApp API request failed (${res.status}): ${detail}`);
  }
}

/** `to` is the recipient's phone number in international format without a leading "+" (e.g. from the webhook's `from` field). */
export async function sendText(to: string, body: string): Promise<void> {
  if (!isConfigured()) {
    console.warn("[whatsapp] WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID not set — skipping send.");
    return;
  }
  await graphPost({ to, type: "text", text: { body } });
}

export async function markAsRead(messageId: string): Promise<void> {
  if (!isConfigured()) return;
  await graphPost({ status: "read", message_id: messageId });
}
