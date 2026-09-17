import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { schedulingTools } from "../tools/schedulingTools.js";

const SYSTEM_PROMPT = `You are the ClinicOS appointment assistant for this clinic.

You help patients with: checking doctor availability, booking appointments,
cancelling appointments, rescheduling appointments, checking appointment status,
and answering questions about the clinic or its doctors (specialties, bios).

Rules:
- Never invent availability, appointment, doctor, or clinic details. Always call a tool to get real data.
- Only book a slot after the patient has confirmed a specific time from find_available_slots results.
- If asked about a doctor or the clinic, use get_doctor_info / get_clinic_info / list_doctors rather
  than answering from memory.
- If the patient asks a clinical question (diagnosis, medication, treatment, interpreting medical
  reports), do NOT answer it. Tell them a clinic staff member or healthcare professional will help
  with that, and offer to help with scheduling instead.
- Keep responses short, friendly, and focused on scheduling.
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
      tools: schedulingTools,
      stateModifier: SYSTEM_PROMPT,
    });
  }
  return agent;
}

export type Intent =
  | "BOOK_APPOINTMENT"
  | "CHECK_AVAILABILITY"
  | "CANCEL_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "APPOINTMENT_STATUS"
  | "UNKNOWN";

const TOOL_TO_INTENT: Record<string, Intent> = {
  find_available_slots: "CHECK_AVAILABILITY",
  list_doctors: "CHECK_AVAILABILITY",
  book_appointment: "BOOK_APPOINTMENT",
  cancel_appointment: "CANCEL_APPOINTMENT",
  reschedule_appointment: "RESCHEDULE_APPOINTMENT",
  get_appointment_status: "APPOINTMENT_STATUS",
};

export interface AgentTurnResult {
  reply: string;
  intent: Intent;
}

export async function runAgentTurn(params: {
  patientId: string;
  message: string;
  history: BaseMessage[];
}): Promise<AgentTurnResult> {
  const contextualMessage = `[patientId: ${params.patientId}] ${params.message}`;

  const result = await getAgent().invoke({
    messages: [...params.history, new HumanMessage(contextualMessage)],
  });

  const last = result.messages[result.messages.length - 1];
  const reply = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content);

  let intent: Intent = "UNKNOWN";
  for (const msg of result.messages) {
    const toolCalls = (msg as AIMessage).tool_calls;
    if (toolCalls?.length) {
      const mapped = TOOL_TO_INTENT[toolCalls[toolCalls.length - 1].name];
      if (mapped) intent = mapped;
    }
  }

  return { reply, intent };
}

export function toLangchainHistory(
  messages: { role: "PATIENT" | "AI"; content: string }[]
): BaseMessage[] {
  return messages.map((m) =>
    m.role === "PATIENT" ? new HumanMessage(m.content) : new AIMessage(m.content)
  );
}
