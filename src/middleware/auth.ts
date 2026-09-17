import { Elysia } from "elysia";
import { verifyAuthToken, type Role } from "../lib/jwt.js";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

/** Attaches `user` from the Bearer token, and rejects the request with 401 if it's missing/invalid. */
export const authGuard = new Elysia({ name: "auth-guard" })
  .derive({ as: "scoped" }, ({ headers }) => {
    const token = headers.authorization?.replace(/^Bearer\s+/i, "");
    return { user: token ? verifyAuthToken(token) : null };
  })
  .onBeforeHandle({ as: "scoped" }, ({ user, set }) => {
    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  });

/** Layer on top of authGuard: only lets the given roles through. */
export function requireRole(...roles: Role[]) {
  return new Elysia({ name: `require-role-${roles.join("-")}` })
    .use(authGuard)
    .onBeforeHandle({ as: "scoped" }, ({ user, set }) => {
      if (!user || !roles.includes(user.role)) {
        set.status = 403;
        return { error: "Forbidden" };
      }
    });
}

/**
 * For endpoints called server-to-server by the frontend (e.g. OAuth upsert during
 * sign-in, before the caller has a user JWT). Guarded by a shared secret instead.
 */
export const internalOnly = new Elysia({ name: "internal-only" }).onBeforeHandle(
  { as: "scoped" },
  ({ headers, set }) => {
    if (!INTERNAL_API_SECRET || headers["x-internal-secret"] !== INTERNAL_API_SECRET) {
      set.status = 401;
      return { error: "Unauthorized" };
    }
  }
);
