import { Elysia, t } from "elysia";
import { google } from "googleapis";
import { prisma } from "../db.js";
import { authGuard } from "../middleware/auth.js";
import type { AuthTokenPayload } from "../lib/jwt.js";
import { signCalendarState, verifyCalendarState } from "../lib/calendarState.js";
import { encrypt } from "../lib/tokenCrypto.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_CALENDAR_REDIRECT_URI =
  process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? "http://localhost:4002/calendar/oauth/callback";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:3000";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function isCalendarConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

function oauthClient() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI);
}

function canManage(user: AuthTokenPayload, doctorId: string) {
  return user.role === "ADMIN" || (user.role === "DOCTOR" && user.doctorId === doctorId);
}

export const calendarRoutes = new Elysia({ prefix: "/doctors/:id/calendar" })
  .use(authGuard)
  .get("/status", async ({ params, user, set }) => {
    if (!canManage(user!, params.id)) {
      set.status = 403;
      return { error: "Forbidden" };
    }
    const account = await prisma.doctorCalendarAccount.findUnique({ where: { doctorId: params.id } });
    return { connected: Boolean(account), calendarId: account?.googleCalendarId ?? null };
  })
  .get("/connect", async ({ params, user, set }) => {
    if (!canManage(user!, params.id)) {
      set.status = 403;
      return { error: "Forbidden" };
    }
    if (!isCalendarConfigured()) {
      set.status = 400;
      return { error: "Google Calendar isn't configured on this server yet." };
    }
    const url = oauthClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [CALENDAR_SCOPE],
      state: signCalendarState(params.id),
    });
    return { url };
  })
  .post("/disconnect", async ({ params, user, set }) => {
    if (!canManage(user!, params.id)) {
      set.status = 403;
      return { error: "Forbidden" };
    }
    await prisma.doctorCalendarAccount.deleteMany({ where: { doctorId: params.id } });
    return { connected: false };
  });

/**
 * Hit directly by Google's browser redirect after consent — no Authorization header
 * is available here, so this is authenticated entirely by the signed `state` param
 * minted in GET /doctors/:id/calendar/connect (see lib/calendarState.ts), not authGuard.
 */
export const calendarOAuthCallbackRoute = new Elysia().get(
  "/calendar/oauth/callback",
  async ({ query, set }) => {
    const doctorId = query.state ? verifyCalendarState(query.state) : null;

    if (!doctorId || !query.code) {
      set.status = 400;
      return { error: "Invalid or expired calendar connection request." };
    }
    if (!isCalendarConfigured()) {
      set.status = 400;
      return { error: "Google Calendar isn't configured on this server yet." };
    }

    try {
      const { tokens } = await oauthClient().getToken(query.code);
      if (!tokens.refresh_token) {
        // Google only issues a refresh token on the first consent (or when re-prompted
        // with prompt=consent, which /connect always sets) — this shouldn't normally happen.
        set.status = 302;
        set.headers.Location = `${FRONTEND_URL}/profile?calendar=error`;
        return;
      }

      await prisma.doctorCalendarAccount.upsert({
        where: { doctorId },
        create: { doctorId, refreshToken: encrypt(tokens.refresh_token) },
        update: { refreshToken: encrypt(tokens.refresh_token) },
      });

      set.status = 302;
      set.headers.Location = `${FRONTEND_URL}/profile?calendar=connected`;
    } catch (err) {
      console.error("[calendar] OAuth callback failed:", err);
      set.status = 302;
      set.headers.Location = `${FRONTEND_URL}/profile?calendar=error`;
    }
  },
  { query: t.Object({ code: t.Optional(t.String()), state: t.Optional(t.String()) }) }
);
