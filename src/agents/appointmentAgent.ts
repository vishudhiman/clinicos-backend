import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { schedulingTools } from "../tools/schedulingTools.js";
import type { AgentContext, AgentReply } from "./types.js";

const SYSTEM_PROMPT = `You are the ClinicOS Appointment Agent.

You handle exactly one thing: appointments. That means checking doctor availability,
booking, cancelling, and rescheduling appointments, and checking appointment status.

Rules:
- Never invent availability or appointment details. Always call a tool to get real data.
- Only book a slot after the patient has confirmed a specific time from find_available_slots results.
- You do not answer general clinic questions (hours, address, doctor bios) or profile/history
  questions — those are handled elsewhere. If asked, briefly say so.
- If the patient asks a clinical question (diagnosis, medication, treatment, interpreting medical
  reports), do NOT answer it. Say a clinic staff member or healthcare professional will help with
  that, and offer to help with scheduling instead.
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

export type AppointmentIntent =
  | "BOOK_APPOINTMENT"
  | "CHECK_AVAILABILITY"
  | "CANCEL_APPOINTMENT"
  | "RESCHEDULE_APPOINTMENT"
  | "APPOINTMENT_STATUS"
  | "UNKNOWN";

const TOOL_TO_INTENT: Record<string, AppointmentIntent> = {
  find_available_slots: "CHECK_AVAILABILITY",
  book_appointment: "BOOK_APPOINTMENT",
  cancel_appointment: "CANCEL_APPOINTMENT",
  reschedule_appointment: "RESCHEDULE_APPOINTMENT",
  get_appointment_status: "APPOINTMENT_STATUS",
};

export async function runAppointmentAgent(ctx: AgentContext): Promise<AgentReply> {
  const contextualMessage = `[patientId: ${ctx.patientId}] ${ctx.message}`;

  const result = await getAgent().invoke({
    messages: [...ctx.history, new HumanMessage(contextualMessage)],
  });

  const last = result.messages[result.messages.length - 1];
  const reply = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content);

  let intent: AppointmentIntent = "UNKNOWN";
  for (const msg of result.messages) {
    const toolCalls = (msg as AIMessage).tool_calls;
    if (toolCalls?.length) {
      const mapped = TOOL_TO_INTENT[toolCalls[toolCalls.length - 1].name];
      if (mapped) intent = mapped;
    }
  }

  return { agent: "APPOINTMENT", reply, intent };
}
