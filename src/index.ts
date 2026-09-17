import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";
import { doctorsRoutes } from "./routes/doctors.js";
import { appointmentsRoutes } from "./routes/appointments.js";
import { conversationsRoutes } from "./routes/conversations.js";
import { patientsRoutes } from "./routes/patients.js";
import { clinicRoutes } from "./routes/clinic.js";
import { chatRoutes } from "./routes/chat.js";
import { authRoutes } from "./routes/auth.js";

const port = process.env.PORT ? Number(process.env.PORT) : 4002;

new Elysia({ adapter: node() })
  .use(cors())
  .get("/", () => ({ status: "ok", service: "clinicos-backend" }))
  .use(doctorsRoutes)
  .use(appointmentsRoutes)
  .use(conversationsRoutes)
  .use(patientsRoutes)
  .use(clinicRoutes)
  .use(chatRoutes)
  .use(authRoutes)
  .listen(port);

console.log(`ClinicOS backend running at http://localhost:${port}`);
