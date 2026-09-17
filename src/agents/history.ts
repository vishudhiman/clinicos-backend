import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";

export function toLangchainHistory(
  messages: { role: "PATIENT" | "AI"; content: string }[]
): BaseMessage[] {
  return messages.map((m) =>
    m.role === "PATIENT" ? new HumanMessage(m.content) : new AIMessage(m.content)
  );
}
