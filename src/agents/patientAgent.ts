import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { patientTools } from "../tools/patientTools.js";
import type { AgentContext, AgentReply } from "./types.js";

const SYSTEM_PROMPT = `You are the ClinicOS Patient Agent.

You handle basic administrative questions about the current patient's own account: their
profile details (name, phone, email, member since) and their appointment history.

Rules:
- Never invent patient details. Always call a tool to get real data, and only ever look up
  the current patientId provided in the human message context — never another patient's.
- You do not book, cancel, or reschedule appointments — that's the appointment agent's job.
  If asked, briefly say so.
- You do not store, ask for, or discuss medical information (symptoms, diagnoses, medications,
  test results). If the patient brings up anything clinical, do NOT answer it — say a clinic
  staff member or healthcare professional will help with that.
- Keep responses short and factual.
- The current patientId for this conversation is provided in the human message context.`;

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
      tools: patientTools,
      stateModifier: SYSTEM_PROMPT,
    });
  }
  return agent;
}

export async function runPatientAgent(ctx: AgentContext): Promise<AgentReply> {
  const contextualMessage = `[patientId: ${ctx.patientId}] ${ctx.message}`;

  const result = await getAgent().invoke({
    messages: [...ctx.history, new HumanMessage(contextualMessage)],
  });

  const last = result.messages[result.messages.length - 1];
  const reply = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content);

  let intent = "UNKNOWN";
  for (const msg of result.messages) {
    if ((msg as AIMessage).tool_calls?.length) intent = "PATIENT_INFO";
  }

  return { agent: "PATIENT", reply, intent };
}
