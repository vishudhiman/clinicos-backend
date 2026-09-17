import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getPatientProfile, getAppointmentHistory } from "../services/patientInfo.js";

export const getPatientProfileTool = tool(
  async ({ patientId }) => {
    const profile = await getPatientProfile(patientId);
    if (!profile) {
      return JSON.stringify({ error: "Patient not found." });
    }
    return JSON.stringify(profile);
  },
  {
    name: "get_patient_profile",
    description:
      "Get the patient's own profile: name, phone number, email, and how long they've been a patient. Use this for questions like 'what's on my profile' or 'what email do you have on file for me'.",
    schema: z.object({ patientId: z.string() }),
  }
);

export const getAppointmentHistoryTool = tool(
  async ({ patientId }) => {
    const history = await getAppointmentHistory(patientId);
    return JSON.stringify(history);
  },
  {
    name: "get_appointment_history",
    description:
      "Get a patient's past and upcoming appointments (doctor, specialty, time, status). Use this for questions like 'what appointments have I had' or 'when did I last see a doctor'. For booking/cancelling/rescheduling, defer to the appointment agent instead.",
    schema: z.object({ patientId: z.string() }),
  }
);

export const patientTools = [getPatientProfileTool, getAppointmentHistoryTool];
