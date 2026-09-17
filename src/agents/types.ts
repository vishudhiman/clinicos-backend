import type { BaseMessage } from "@langchain/core/messages";

export type AgentName = "APPOINTMENT" | "CLINIC_INFO" | "PATIENT";

export interface AgentContext {
  patientId: string;
  message: string;
  history: BaseMessage[];
}

export interface AgentReply {
  agent: AgentName;
  reply: string;
  intent: string;
}
