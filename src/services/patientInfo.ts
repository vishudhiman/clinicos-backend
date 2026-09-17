import { prisma } from "../db.js";

export interface PatientProfile {
  id: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  memberSince: Date;
}

export async function getPatientProfile(patientId: string): Promise<PatientProfile | null> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return null;
  return {
    id: patient.id,
    name: patient.name,
    phoneNumber: patient.phoneNumber,
    email: patient.email,
    memberSince: patient.createdAt,
  };
}

export interface AppointmentHistoryEntry {
  id: string;
  doctorName: string;
  specialty: string;
  startTime: Date;
  status: string;
}

export async function getAppointmentHistory(patientId: string): Promise<AppointmentHistoryEntry[]> {
  const appointments = await prisma.appointment.findMany({
    where: { patientId },
    include: { doctor: true },
    orderBy: { startTime: "desc" },
    take: 20,
  });
  return appointments.map((a) => ({
    id: a.id,
    doctorName: a.doctor.name,
    specialty: a.doctor.specialty,
    startTime: a.startTime,
    status: a.status,
  }));
}
