import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Missing required env var: DATABASE_URL");
}

export const db = new Pool({
  connectionString: databaseUrl,
  max: 10
});
