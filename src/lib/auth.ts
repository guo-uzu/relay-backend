import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { db } from "../db/index.ts";
import { account, invitation, member, organization as organizationTable, session, user, verification } from "../db/schema.ts";
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
    })
  ]
});
