import { betterAuth } from "better-auth";
import { pool } from "./lib/db";
import { getWebConfig } from "./lib/config";

const config = getWebConfig();

const socialProviders: {
  discord?: {
    clientId: string;
    clientSecret: string;
    scope: string[];
  };
} = {};

if (config.discordClientId && config.discordClientSecret) {
  socialProviders.discord = {
    clientId: config.discordClientId,
    clientSecret: config.discordClientSecret,
    scope: ["identify", "guilds", "guilds.members.read"],
  };
}

export const auth = betterAuth({
  secret: config.betterAuthSecret,
  baseURL: config.betterAuthUrl,
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  socialProviders,
});

export default auth;
