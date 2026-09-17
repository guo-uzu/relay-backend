import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: new Pool({
    database: "postgres",
    user: "postgres_user",
    password: "pass123",
    port: 5432,
    ssl: false,
    max: 20,
    idleTimeoutMillis: 1000, // close idle clients after 1 second
    connectionTimeoutMillis: 1000, // return an error after 1 second if connection could not be established
    maxUses: 7500, // close (and replace) a connection after it has been used 7500 times (see below for discussion)
  }),
  emailAndPassword: {
    enabled: true,
  },
});
