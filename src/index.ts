import { Elysia } from "elysia";
import { node } from "@elysiajs/node";
import { cors } from "@elysiajs/cors";

const port = process.env.PORT ? Number(process.env.PORT) : 4002;

new Elysia({ adapter: node() })
  .use(cors())
  .get("/", () => ({ status: "ok", service: "clinicos-backend" }))
  .listen(port);

console.log(`ClinicOS backend running at http://localhost:${port}`);
