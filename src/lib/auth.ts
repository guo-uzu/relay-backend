import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import {drizzleAdapter} from "better-auth/adapters/drizzle"
import { db } from "../db/index.ts";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {provider: "pg"}),
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
