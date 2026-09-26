import { and, eq } from "drizzle-orm";
import { db } from "../db/index.ts";
import { member } from "../db/schema.ts";

export const validateUserOrg = async (org: string, userId: string) => {
  const memberId = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, org), eq(member.userId, userId)));
  if (!memberId[0]) {
    console.log("Not match");
    return false;
  }
  return true;
};
