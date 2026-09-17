import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const clinic = await prisma.clinic.create({
    data: {
      name: "Demo Clinic",
      description:
        "Demo Clinic is a multi-specialty outpatient clinic offering dermatology and general medicine consultations, open Monday through Saturday.",
      address: "221B Residency Road, Bengaluru, Karnataka 560025",
      openingHours: "Mon–Sat 10:00 AM – 7:00 PM, closed Sundays",
    },
  });

  const drSharma = await prisma.doctor.create({
    data: {
      clinicId: clinic.id,
      name: "Dr. Sharma",
      specialty: "Dermatology",
      bio: "Dr. Sharma is a dermatologist with over 10 years of experience treating acne, skin allergies, and hair loss.",
      schedules: {
        create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: "10:00",
          endTime: "19:00",
          slotMinutes: 30,
        })),
      },
    },
  });

  const drGupta = await prisma.doctor.create({
    data: {
      clinicId: clinic.id,
      name: "Dr. Gupta",
      specialty: "General Medicine",
      bio: "Dr. Gupta is a general physician focused on preventive care, chronic disease management, and routine health checkups.",
      schedules: {
        create: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
          dayOfWeek,
          startTime: "09:00",
          endTime: "17:00",
          slotMinutes: 20,
        })),
      },
    },
  });

  const patient = await prisma.patient.create({
    data: {
      name: "Asha Verma",
      phoneNumber: "+919876543210",
      email: "asha.verma@clinicos.dev",
    },
  });

  await prisma.user.create({
    data: {
      name: "Dr. Sharma",
      email: "dr.sharma@clinicos.dev",
      passwordHash,
      role: "DOCTOR",
      doctorId: drSharma.id,
    },
  });

  await prisma.user.create({
    data: {
      name: "Dr. Gupta",
      email: "dr.gupta@clinicos.dev",
      passwordHash,
      role: "DOCTOR",
      doctorId: drGupta.id,
    },
  });

  await prisma.user.create({
    data: {
      name: "Asha Verma",
      email: "asha.verma@clinicos.dev",
      passwordHash,
      role: "PATIENT",
      patientId: patient.id,
    },
  });

  await prisma.user.create({
    data: {
      name: "Clinic Admin",
      email: "admin@clinicos.dev",
      passwordHash,
      role: "ADMIN",
    },
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(11, 0, 0, 0);

  await prisma.appointment.create({
    data: {
      doctorId: drSharma.id,
      patientId: patient.id,
      startTime: tomorrow,
      endTime: new Date(tomorrow.getTime() + 30 * 60 * 1000),
      status: "CONFIRMED",
    },
  });

  console.log("Seed complete.");
  console.log("Demo login password for every account below:", DEMO_PASSWORD);
  console.table([
    { role: "DOCTOR", email: "dr.sharma@clinicos.dev" },
    { role: "DOCTOR", email: "dr.gupta@clinicos.dev" },
    { role: "PATIENT", email: "asha.verma@clinicos.dev" },
    { role: "ADMIN", email: "admin@clinicos.dev" },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
