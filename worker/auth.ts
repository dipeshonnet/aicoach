import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import type { Env } from "./env";

// Use Workers' native crypto rather than spending the isolate's CPU on JS scrypt.
async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export function authFor(env: Env, origin: string) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("Authentication is not configured");
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL || origin,
    trustedOrigins: [env.APP_URL || origin],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      password: {
        hash: async (password) => {
          const salt = randomBytes(16).toString("hex");
          return salt + ":" + (await derive(password, salt)).toString("hex");
        },
        verify: async ({ hash, password }) => {
          const [salt, key] = hash.split(":");
          if (!salt || !key || key.length !== 128) return false;
          const expected = Buffer.from(key, "hex");
          const actual = await derive(password, salt);
          return (
            expected.length === actual.length &&
            timingSafeEqual(expected, actual)
          );
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 30,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 30 },
        "/change-password": { window: 60, max: 10 },
      },
    },
    plugins: [
      admin({
        defaultRole: "agent",
        adminRoles: ["admin"],
        roles: { admin: adminAc, trainer: userAc, agent: userAc },
      }),
    ],
    logger: { disabled: true },
  });
}
export function secretMatches(input: string, expected: string) {
  const a = Buffer.from(input),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
