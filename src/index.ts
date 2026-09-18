import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";
import { doctorsRoutes } from "./routes/doctors.js";
import { appointmentsRoutes } from "./routes/appointments.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { patientsRoutes } from "./routes/patients.js";
import { clinicRoutes } from "./routes/clinic.js";
import { notificationsRoutes } from "./routes/notifications.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { calendarRoutes, calendarOAuthCallbackRoute } from "./routes/calendar.js";
import { whatsappRoutes } from "./routes/whatsapp.js";
import { startReminderScheduler } from "./services/notifications/scheduler.js";

const port = process.env.PORT ? Number(process.env.PORT) : 4002;

new Elysia({ adapter: node() })
  .use(cors())
  .get("/", () => ({ status: "ok", service: "clinicos-backend" }))
  .use(doctorsRoutes)
  .use(appointmentsRoutes)
  .use(conversationsRoutes)
  .use(patientsRoutes)
  .use(clinicRoutes)
  .use(notificationsRoutes)
  .use(authRoutes)
  .use(chatRoutes)
  .use(calendarRoutes)
  .use(calendarOAuthCallbackRoute)
  .use(whatsappRoutes)
  .listen(port);

startReminderScheduler();

console.log(`ClinicOS backend running at http://localhost:${port}`);
