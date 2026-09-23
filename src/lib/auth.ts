import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { Pool } from "pg";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: new Pool({
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASS,
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
  user: {
    additionalFields: {
      plan: {type: "string", defaultValue: "free", input: false}
    }
  },
  plugins: [
    organization({
      organizationLimit: 1,
      membershipLimit: (user, org) => user.plan === "pro" ? 50 : 5,
    })
  ]
});
