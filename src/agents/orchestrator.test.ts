import { describe, expect, it, vi } from "vitest";
import {
  runOrchestratorTurn,
  looksClinical,
  ESCALATION_MESSAGE,
  type OrchestratorDeps,
  type RoutingDecision,
} from "./orchestrator.js";
import type { AgentReply } from "./types.js";

function fakeReply(agent: AgentReply["agent"], reply: string, intent: string): AgentReply {
  return { agent, reply, intent };
}

function makeDeps(overrides: Partial<OrchestratorDeps> & { decision: RoutingDecision }): OrchestratorDeps {
  return {
    classify: vi.fn().mockResolvedValue(overrides.decision),
    runAppointmentAgent: vi.fn().mockResolvedValue(fakeReply("APPOINTMENT", "no-op", "UNKNOWN")),
    runClinicInfoAgent: vi.fn().mockResolvedValue(fakeReply("CLINIC_INFO", "no-op", "UNKNOWN")),
    runPatientAgent: vi.fn().mockResolvedValue(fakeReply("PATIENT", "no-op", "UNKNOWN")),
    ...overrides,
  };
}

const baseParams = { patientId: "patient-1", message: "hello", history: [] };

describe("runOrchestratorTurn routing", () => {
  it("routes an appointment request to the Appointment Agent only", async () => {
    const deps = makeDeps({
      decision: { escalate: false, agents: ["APPOINTMENT"] },
      runAppointmentAgent: vi
        .fn()
        .mockResolvedValue(fakeReply("APPOINTMENT", "Dr. Sharma is free at 5pm.", "CHECK_AVAILABILITY")),
    });

    const result = await runOrchestratorTurn(
      { ...baseParams, message: "Is Dr Sharma free tomorrow evening?" },
      deps
    );

    expect(deps.runAppointmentAgent).toHaveBeenCalledTimes(1);
    expect(deps.runClinicInfoAgent).not.toHaveBeenCalled();
    expect(deps.runPatientAgent).not.toHaveBeenCalled();
    expect(result.reply).toBe("Dr. Sharma is free at 5pm.");
    expect(result.agentsUsed).toEqual(["APPOINTMENT"]);
    expect(result.escalated).toBe(false);
  });

  it("routes a clinic-hours request to the Clinic Information Agent only", async () => {
    const deps = makeDeps({
      decision: { escalate: false, agents: ["CLINIC_INFO"] },
      runClinicInfoAgent: vi
        .fn()
        .mockResolvedValue(fakeReply("CLINIC_INFO", "We close at 7pm.", "CLINIC_INFO")),
    });

    const result = await runOrchestratorTurn(
      { ...baseParams, message: "What time does the clinic close?" },
      deps
    );

    expect(deps.runClinicInfoAgent).toHaveBeenCalledTimes(1);
    expect(deps.runAppointmentAgent).not.toHaveBeenCalled();
    expect(deps.runPatientAgent).not.toHaveBeenCalled();
    expect(result.reply).toBe("We close at 7pm.");
    expect(result.agentsUsed).toEqual(["CLINIC_INFO"]);
  });

  it("routes a patient-history request to the Patient Agent only", async () => {
    const deps = makeDeps({
      decision: { escalate: false, agents: ["PATIENT"] },
      runPatientAgent: vi
        .fn()
        .mockResolvedValue(fakeReply("PATIENT", "You last saw Dr. Gupta in March.", "PATIENT_INFO")),
    });

    const result = await runOrchestratorTurn(
      { ...baseParams, message: "What appointments have I had?" },
      deps
    );

    expect(deps.runPatientAgent).toHaveBeenCalledTimes(1);
    expect(deps.runAppointmentAgent).not.toHaveBeenCalled();
    expect(deps.runClinicInfoAgent).not.toHaveBeenCalled();
    expect(result.reply).toBe("You last saw Dr. Gupta in March.");
    expect(result.agentsUsed).toEqual(["PATIENT"]);
  });

  it("routes a mixed request to multiple agents and combines their replies", async () => {
    const deps = makeDeps({
      decision: { escalate: false, agents: ["APPOINTMENT", "CLINIC_INFO"] },
      runAppointmentAgent: vi
        .fn()
        .mockResolvedValue(fakeReply("APPOINTMENT", "Dr. Sharma has a 6pm slot open.", "CHECK_AVAILABILITY")),
      runClinicInfoAgent: vi
        .fn()
        .mockResolvedValue(fakeReply("CLINIC_INFO", "The clinic closes at 7pm.", "CLINIC_INFO")),
    });

    const result = await runOrchestratorTurn(
      { ...baseParams, message: "Can I see Dr Sharma tomorrow evening and what time does the clinic close?" },
      deps
    );

    expect(deps.runAppointmentAgent).toHaveBeenCalledTimes(1);
    expect(deps.runClinicInfoAgent).toHaveBeenCalledTimes(1);
    expect(deps.runPatientAgent).not.toHaveBeenCalled();
    expect(result.agentsUsed).toEqual(["APPOINTMENT", "CLINIC_INFO"]);
    expect(result.reply).toContain("Dr. Sharma has a 6pm slot open.");
    expect(result.reply).toContain("The clinic closes at 7pm.");
    expect(result.intent).toBe("CHECK_AVAILABILITY+CLINIC_INFO");
  });

  it("escalates a clinical question without calling any specialized agent", async () => {
    const deps = makeDeps({ decision: { escalate: true, agents: [] } });

    const result = await runOrchestratorTurn(
      { ...baseParams, message: "What medication should I take for this rash?" },
      deps
    );

    expect(deps.runAppointmentAgent).not.toHaveBeenCalled();
    expect(deps.runClinicInfoAgent).not.toHaveBeenCalled();
    expect(deps.runPatientAgent).not.toHaveBeenCalled();
    expect(result.reply).toBe(ESCALATION_MESSAGE);
    expect(result.escalated).toBe(true);
    expect(result.agentsUsed).toEqual([]);
  });

  it("asks for clarification when no agent is needed and it isn't clinical", async () => {
    const deps = makeDeps({ decision: { escalate: false, agents: [] } });

    const result = await runOrchestratorTurn({ ...baseParams, message: "hi" }, deps);

    expect(deps.runAppointmentAgent).not.toHaveBeenCalled();
    expect(deps.runClinicInfoAgent).not.toHaveBeenCalled();
    expect(deps.runPatientAgent).not.toHaveBeenCalled();
    expect(result.escalated).toBe(false);
    expect(result.agentsUsed).toEqual([]);
  });
});

describe("looksClinical", () => {
  it("flags obvious clinical questions", () => {
    expect(looksClinical("What medication should I take for a fever?")).toBe(true);
    expect(looksClinical("Can you diagnose this rash for me?")).toBe(true);
    expect(looksClinical("What's the dosage for paracetamol?")).toBe(true);
  });

  it("does not flag ordinary administrative questions", () => {
    expect(looksClinical("Is Dr Sharma free tomorrow evening?")).toBe(false);
    expect(looksClinical("What time does the clinic close?")).toBe(false);
    expect(looksClinical("What appointments have I had?")).toBe(false);
  });
});
