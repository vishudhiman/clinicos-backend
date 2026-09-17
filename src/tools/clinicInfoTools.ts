import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getClinicInfo, listDoctors, findDoctorByName, getDoctorSchedule } from "../services/clinicInfo.js";

export const getClinicInfoTool = tool(
  async () => {
    const clinic = await getClinicInfo();
    if (!clinic) {
      return JSON.stringify({ error: "No clinic information on file." });
    }
    return JSON.stringify(clinic);
  },
  {
    name: "get_clinic_info",
    description:
      "Get general information about the clinic itself: name, description, address, and opening hours. Use this for questions like 'where are you located' or 'when do you close'. Never invent details not returned here.",
    schema: z.object({}),
  }
);

export const listDoctorsTool = tool(
  async () => {
    const doctors = await listDoctors();
    return JSON.stringify(doctors);
  },
  {
    name: "list_doctors",
    description:
      "List all doctors at the clinic with their id, name, specialty, and bio. Use this to answer questions about which doctors are available or what they specialize in.",
    schema: z.object({}),
  }
);

export const getDoctorInfoTool = tool(
  async ({ doctorName }) => {
    const doctor = await findDoctorByName(doctorName);
    if (!doctor) {
      return JSON.stringify({ error: `No doctor found matching "${doctorName}".` });
    }
    return JSON.stringify({
      name: doctor.name,
      specialty: doctor.specialty,
      bio: doctor.bio ?? "No bio on file.",
    });
  },
  {
    name: "get_doctor_info",
    description:
      "Get a specific doctor's specialty and bio. Use this to answer patient questions like 'what does Dr. X specialize in' or 'tell me about Dr. X'. Never invent details not returned here.",
    schema: z.object({ doctorName: z.string() }),
  }
);

export const getDoctorScheduleTool = tool(
  async ({ doctorName }) => {
    const doctor = await getDoctorSchedule(doctorName);
    if (!doctor) {
      return JSON.stringify({ error: `No doctor found matching "${doctorName}".` });
    }
    return JSON.stringify(doctor);
  },
  {
    name: "get_doctor_schedule",
    description:
      "Get which days of the week a doctor works and their working hours on each day. Use this for questions like 'which days is Dr. X available' or 'what are Dr. X's working hours'. This is about their weekly schedule, not specific open appointment slots — use the appointment agent for actual bookable slots.",
    schema: z.object({ doctorName: z.string() }),
  }
);

export const clinicInfoTools = [
  getClinicInfoTool,
  listDoctorsTool,
  getDoctorInfoTool,
  getDoctorScheduleTool,
];
