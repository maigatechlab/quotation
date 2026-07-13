import { eq } from "drizzle-orm";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
import { account, user as userTable } from "../src/lib/schema";

// Seeds the tenant admin account the auth/quote specs log in with. Runs in the
// Playwright runner process (env already loaded by playwright.config.ts) and
// talks to Better Auth directly so the password hash matches sign-in.
export default async function globalSetup() {
  const email = process.env.E2E_ADMIN_EMAIL ?? "admin@quotation.test";
  const password = process.env.E2E_ADMIN_PASSWORD ?? "Test1234!";

  // Recreate from scratch so a stale password never breaks the suite.
  const existing = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  if (existing[0]) {
    await db.delete(account).where(eq(account.userId, existing[0].id));
    await db.delete(userTable).where(eq(userTable.id, existing[0].id));
  }

  await auth.api.signUpEmail({
    body: { email, password, name: "Admin E2E" },
    headers: new Headers({ origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000" }),
  });

  await db
    .update(userTable)
    .set({ role: "admin", emailVerified: true })
    .where(eq(userTable.email, email));
}
