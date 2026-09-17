import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import type { BaseMessage } from "@langchain/core/messages";
import type { AgentContext, AgentName, AgentReply } from "./types.js";
import { runAppointmentAgent } from "./appointmentAgent.js";
import { runClinicInfoAgent } from "./clinicInfoAgent.js";
import { runPatientAgent } from "./patientAgent.js";

export const ESCALATION_MESSAGE =
  "I'm not able to help with medical questions like diagnosis, medication, or treatment — " +
  "please reach out to clinic staff or a healthcare professional for that. I can help with " +
  "appointments, clinic information, or your profile instead.";

const CLARIFICATION_MESSAGE =
  "I can help with booking/appointments, clinic information (hours, address, doctors), or your " +
  "own profile and appointment history. Could you tell me a bit more about what you need?";

// Cheap deterministic net that runs before any LLM call — catches obvious clinical asks
// without spending a classification round-trip, and can't be "argued around" by the model.
const CLINICAL_KEYWORDS =
  /\b(diagnos\w*|symptom\w*|medicat\w*|dosage|prescri\w*|treatment\w*|disease\w*|side[- ]effect\w*|infection\w*)\b/i;

export function looksClinical(message: string): boolean {
  return CLINICAL_KEYWORDS.test(message);
}

export interface RoutingDecision {
  escalate: boolean;
  agents: AgentName[];
}

const RoutingSchema = z.object({
  escalate: z
    .boolean()
    .describe(
      "true if the user is asking for medical diagnosis, medication/treatment advice, or interpretation of symptoms or test results"
    ),
  agents: z
    .array(z.enum(["APPOINTMENT", "CLINIC_INFO", "PATIENT"]))
    .describe(
      "Which specialized agent(s) are needed to answer this message. APPOINTMENT: availability, booking, cancelling, rescheduling, appointment status. CLINIC_INFO: clinic hours, address, doctors, specialties, doctor working days. PATIENT: the patient's own profile or appointment history. Include more than one if the message needs it."
    ),
});

let classifierModel: ChatGoogleGenerativeAI | null = null;

function getClassifierModel() {
  if (!classifierModel) {
    classifierModel = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash-lite",
      temperature: 0,
      apiKey: process.env.GEMINI_API_KEY,
    });
  }
  return classifierModel;
}

export async function classifyRequest(message: string): Promise<RoutingDecision> {
  if (looksClinical(message)) {
    return { escalate: true, agents: [] };
  }
  const router = getClassifierModel().withStructuredOutput(RoutingSchema, { name: "route" });
  return (await router.invoke(message)) as RoutingDecision;
}

export interface OrchestratorParams {
  patientId: string;
  message: string;
  history: BaseMessage[];
}

export interface OrchestratorResult {
  reply: string;
  intent: string;
  agentsUsed: AgentName[];
  escalated: boolean;
}

export interface OrchestratorDeps {
  classify: (message: string) => Promise<RoutingDecision>;
  runAppointmentAgent: (ctx: AgentContext) => Promise<AgentReply>;
  runClinicInfoAgent: (ctx: AgentContext) => Promise<AgentReply>;
  runPatientAgent: (ctx: AgentContext) => Promise<AgentReply>;
}

const defaultDeps: OrchestratorDeps = {
  classify: classifyRequest,
  runAppointmentAgent,
  runClinicInfoAgent,
  runPatientAgent,
};

/**
 * The Clinic Orchestrator: classifies the request, routes it to the specialized agent(s)
 * that own that domain, and stitches their replies into one response. It never talks to
 * Prisma, a service, or a tool directly — all business logic lives one layer down.
 */
export async function runOrchestratorTurn(
  params: OrchestratorParams,
  deps: OrchestratorDeps = defaultDeps
): Promise<OrchestratorResult> {
  const decision = await deps.classify(params.message);

  if (decision.escalate) {
    return { reply: ESCALATION_MESSAGE, intent: "ESCALATED", agentsUsed: [], escalated: true };
  }

  if (decision.agents.length === 0) {
    return { reply: CLARIFICATION_MESSAGE, intent: "UNKNOWN", agentsUsed: [], escalated: false };
  }

  const runners: Record<AgentName, (ctx: AgentContext) => Promise<AgentReply>> = {
    APPOINTMENT: deps.runAppointmentAgent,
    CLINIC_INFO: deps.runClinicInfoAgent,
    PATIENT: deps.runPatientAgent,
  };

  const ctx: AgentContext = {
    patientId: params.patientId,
    message: params.message,
    history: params.history,
  };

  const replies = await Promise.all(decision.agents.map((name) => runners[name](ctx)));

  const reply =
    replies.length === 1 ? replies[0].reply : replies.map((r) => r.reply).join("\n\n");
  const intent = replies.map((r) => r.intent).join("+");

  return { reply, intent, agentsUsed: decision.agents, escalated: false };
}
