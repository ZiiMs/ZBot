import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";

const discordClientId = process.env.DISCORD_CLIENT_ID;
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET;
const authBaseURL = (process.env.BETTER_AUTH_URL ?? process.env.APP_BASE_URL ?? "").replace(/\/$/, "");

export const auth = betterAuth({
  database: db,
  baseURL: authBaseURL,
  emailAndPassword: {
    enabled: true
  },
  socialProviders:
    discordClientId && discordClientSecret
      ? {
          discord: {
            clientId: discordClientId,
            clientSecret: discordClientSecret,
            redirectURI: `${authBaseURL}/api/auth/callback/discord`
          }
        }
      : undefined,
  plugins: [nextCookies()]
});
