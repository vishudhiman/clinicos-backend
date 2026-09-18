import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

interface CalendarStatePayload {
  doctorId: string;
  purpose: "calendar-connect";
}

/**
 * Google's OAuth redirect lands on /calendar/oauth/callback as a plain browser
 * navigation — no Authorization header. This signed, short-lived `state` value stands
 * in for the auth token: it's the only thing binding that callback to a specific doctor.
 * `purpose` prevents an ordinary auth JWT (or a state token) from being replayed as the
 * other type.
 */
export function signCalendarState(doctorId: string): string {
  const payload: CalendarStatePayload = { doctorId, purpose: "calendar-connect" };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "10m" });
}

export function verifyCalendarState(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as CalendarStatePayload;
    return payload.purpose === "calendar-connect" ? payload.doctorId : null;
  } catch {
    return null;
  }
}
