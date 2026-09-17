import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { clinicInfoTools } from "../tools/clinicInfoTools.js";
import type { AgentContext, AgentReply } from "./types.js";

const SYSTEM_PROMPT = `You are the ClinicOS Clinic Information Agent.

You handle general, non-personal questions about the clinic: opening hours, address,
which doctors work here, their specialties, and which days/hours a doctor works.

Rules:
- Never invent clinic or doctor details. Always call a tool to get real data.
- You do not book, cancel, or reschedule appointments, and you do not know about specific
  open appointment slots — that's the appointment agent's job. If asked, briefly say so.
- You do not have access to any patient's personal information.
- If asked a clinical question (diagnosis, medication, treatment), do NOT answer it. Say a
  clinic staff member or healthcare professional will help with that.
- Keep responses short and factual.`;

let agent: ReturnType<typeof createReactAgent> | null = null;

function getAgent() {
  if (!agent) {
    const model = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash-lite",
      temperature: 0,
      apiKey: process.env.GEMINI_API_KEY,
    });
    agent = createReactAgent({
      llm: model,
      tools: clinicInfoTools,
      stateModifier: SYSTEM_PROMPT,
    });
  }
  return agent;
}

export async function runClinicInfoAgent(ctx: AgentContext): Promise<AgentReply> {
  const result = await getAgent().invoke({
    messages: [...ctx.history, new HumanMessage(ctx.message)],
  });

  const last = result.messages[result.messages.length - 1];
  const reply = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content);

  let intent = "UNKNOWN";
  for (const msg of result.messages) {
    if ((msg as AIMessage).tool_calls?.length) intent = "CLINIC_INFO";
  }

  return { agent: "CLINIC_INFO", reply, intent };
}
