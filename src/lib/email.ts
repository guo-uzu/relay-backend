import { Resend } from "resend";
import { logger } from "./logger.ts";

const DEFAULT_FROM = "Relay <onboarding@resend.dev>";

let resendClient: Resend | null = null;

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_KEY;

  if (!apiKey) {
    throw new Error(
      "RESEND_KEY is not set. Add your Resend API key to .env to send organization invitation emails.",
    );
  }

  resendClient ??= new Resend(apiKey);

  return resendClient;
}

export type OrganizationInvitationEmail = {
  to: string;
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
  inviteLink: string;
};

export async function sendOrganizationInvitation({
  to,
  organizationName,
  inviterName,
  inviterEmail,
  inviteLink,
}: OrganizationInvitationEmail) {
  const inviter = inviterName.trim() || inviterEmail;
  const organization = escapeHtml(organizationName);
  const inviterLabel = escapeHtml(inviter);
  const inviterEmailLabel = escapeHtml(inviterEmail);
  const link = escapeHtml(inviteLink);

  const { data, error } = await getResendClient().emails.send({
    from: process.env.RESEND_FROM ?? DEFAULT_FROM,
    to,
    subject: `${inviter} invited you to join ${organizationName}`,
    text: [
      `${inviter} (${inviterEmail}) invited you to join ${organizationName}.`,
      "",
      "Accept the invitation:",
      inviteLink,
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    <div style="max-width:480px;margin:0 auto;padding:32px;background:#ffffff;border-radius:8px;">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">You're invited to join ${organization}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">
        <strong>${inviterLabel}</strong> (${inviterEmailLabel}) invited you to join
        <strong>${organization}</strong>.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${link}" style="display:inline-block;padding:12px 20px;background:#1a1a1a;color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px;">
          Accept invitation
        </a>
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#666666;">
        If the button doesn't work, copy and paste this link into your browser:<br />
        <a href="${link}" style="color:#1a1a1a;">${link}</a>
      </p>
    </div>
  </body>
</html>`,
  });

  if (error) {
    logger.error(
      { err: error, to, organization: organizationName },
      "Failed to send organization invitation email",
    );

    throw new Error(`Failed to send organization invitation email: ${error.message}`);
  }

  logger.info(
    { emailId: data.id, to, organization: organizationName },
    "Organization invitation email sent",
  );

  return data;
}
