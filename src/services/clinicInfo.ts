import { prisma } from "../db.js";

export interface ClinicInfo {
  name: string;
  description: string | null;
  address: string | null;
  openingHours: string | null;
}

export async function getClinicInfo(): Promise<ClinicInfo | null> {
  const clinic = await prisma.clinic.findFirst();
  if (!clinic) return null;
  return {
    name: clinic.name,
    description: clinic.description,
    address: clinic.address,
    openingHours: clinic.openingHours,
  };
}

export interface DoctorSummary {
  id: string;
  name: string;
  specialty: string;
  bio: string | null;
}

export async function listDoctors(): Promise<DoctorSummary[]> {
  const doctors = await prisma.doctor.findMany();
  return doctors.map((d) => ({ id: d.id, name: d.name, specialty: d.specialty, bio: d.bio }));
}

// Plain substring matching breaks on titles/punctuation the caller may or may not include
// (e.g. "Dr Gupta" is not a substring of "Dr. Gupta"). Normalize both sides instead.
function normalizeDoctorQuery(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bdr\.?\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function findDoctorByName(name: string) {
  const query = normalizeDoctorQuery(name);
  if (!query) return null;
  const doctors = await prisma.doctor.findMany();
  return (
    doctors.find((d) => normalizeDoctorQuery(d.name) === query) ??
    doctors.find((d) => normalizeDoctorQuery(d.name).includes(query)) ??
    null
  );
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface DoctorSchedule {
  day: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
}

export interface DoctorWithSchedule extends DoctorSummary {
  schedules: DoctorSchedule[];
}

export async function getDoctorSchedule(doctorName: string): Promise<DoctorWithSchedule | null> {
  const match = await findDoctorByName(doctorName);
  if (!match) return null;
  const doctor = await prisma.doctor.findUniqueOrThrow({
    where: { id: match.id },
    include: { schedules: true },
  });
  return {
    id: doctor.id,
    name: doctor.name,
    specialty: doctor.specialty,
    bio: doctor.bio,
    schedules: doctor.schedules
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map((s) => ({
        day: DAY_NAMES[s.dayOfWeek],
        startTime: s.startTime,
        endTime: s.endTime,
        slotMinutes: s.slotMinutes,
      })),
  };
}

export async function getSlotMinutesForDoctorOnDay(
  doctorId: string,
  dayOfWeek: number
): Promise<number> {
  const schedule = await prisma.doctorSchedule.findFirst({ where: { doctorId, dayOfWeek } });
  return schedule?.slotMinutes ?? 30;
}
