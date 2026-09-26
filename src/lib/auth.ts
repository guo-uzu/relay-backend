import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { db } from "../db/index.ts";
import { account, invitation, member, organization as organizationTable, session, user, verification } from "../db/schema.ts";

const isProUser = (user: { plan?: string }) => user.plan === "pro";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
      organization: organizationTable,
      member,
      invitation,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      plan: { type: "string", defaultValue: "free", input: false },
    }
  },
  plugins: [
    organization({
      organizationLimit: 1,
      membershipLimit: (user) => isProUser(user as unknown as { plan?: string }) ? 50 : 5,
    })
  ]
});
