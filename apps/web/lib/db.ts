import { Pool } from "pg";
import { config } from "@/lib/config";

export const db = new Pool({
  connectionString: config.databaseUrl,
  max: 10
});
