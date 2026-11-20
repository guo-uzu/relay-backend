import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { db } from "../db/index.ts";
import { account, apikey, invitation, member, organization as organizationTable, session, user, verification } from "../db/schema.ts";
import { sendOrganizationInvitation } from "./email.ts";
import { validateUserOrgRole } from "./validate.user.org.ts";

const trustedOriginsArray = ["http://localhost:5173"]
const isProUser = (user: { plan?: string }) => user.plan === "pro";

async function sendInvitation(email: string, organizationId: string, role: string, inviterId: string, invitationId: string) {
  const isAuthorized = await validateUserOrgRole(organizationId, inviterId, ["owner", "admin"]);
  if (!isAuthorized) {
    throw new Error("Not authorized to invite members to this organization");
  }

  const [org] = await db
    .select({ name: organizationTable.name })
    .from(organizationTable)
    .where(eq(organizationTable.id, organizationId));
  const [inviter] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, inviterId));

  await sendOrganizationInvitation({
    to: email,
    organizationName: org.name,
    inviterName: inviter.name ?? "",
    inviterEmail: inviter.email,
    inviteLink: `${trustedOriginsArray[0]}/accept-invitation/${invitationId}`,
  });
}

export const auth = betterAuth({
  trustedOrigins: trustedOriginsArray,
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
      apikey,
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
      async sendInvitationEmail(data) {
        await sendInvitation(data.email, data.organization.id, data.role, data.inviter.user.id, data.id);
      },
    }),
    // Keys for the Apps Script. They belong to an organization, so the webhook can
    // derive the org from the key instead of trusting anything the script sends.
    apiKey({
      references: "organization",
      defaultPrefix: "rly_",
      // the client may attach { sheetId } to scope a key to one connection (re-checked in the webhook)
      enableMetadata: true,
      // the plugin default is 10 requests/day, which would reject a busy sheet
      rateLimit: { enabled: false },
    }),
  ]
});
