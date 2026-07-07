#!/usr/bin/env npx tsx
/**
 * Create or promote a superadmin user.
 * Usage: pnpm tsx scripts/create-superadmin.ts
 */

import { createInterface } from "readline";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

const c = (color: keyof typeof colors, msg: string) =>
  `${colors[color]}${msg}${colors.reset}`;

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  if (hidden) {
    // Hide password input
    process.stdout.write(`${c("cyan", "? ")}${question} `);
    return new Promise((resolve) => {
      let value = "";
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", function handler(ch: string) {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener("data", handler);
          process.stdout.write("\n");
          rl.close();
          resolve(value);
        } else if (ch === "") {
          process.exit();
        } else if (ch === "") {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      });
    });
  }
  return new Promise((resolve) => {
    rl.question(`${c("cyan", "? ")}${question} `, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function main() {
  console.log(`\n${c("cyan", "═".repeat(50))}`);
  console.log(`  Superadmin Setup`);
  console.log(`${c("cyan", "═".repeat(50))}\n`);

  // Lazy-load DB after env is set
  const { db } = await import("../src/lib/db");
  const { user: userTable } = await import("../src/lib/schema");
  const { eq } = await import("drizzle-orm");

  const email = await prompt("Email:");
  if (!email || !email.includes("@")) {
    console.log(c("red", "✗ Invalid email"));
    process.exit(1);
  }

  // Check existing user
  const existing = await db
    .select({ id: userTable.id, name: userTable.name, role: userTable.role })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  if (existing.length > 0) {
    const u = existing[0]!;
    if (u.role === "superadmin") {
      console.log(c("yellow", `⚠ ${u.name} (${email}) already superadmin`));
      process.exit(0);
    }
    console.log(c("yellow", `⚠ User found: ${u.name} — current role: ${u.role}`));
    const confirm = await prompt("Promote to superadmin? (y/n):");
    if (confirm.toLowerCase() !== "y") {
      console.log("Cancelled.");
      process.exit(0);
    }
    await db
      .update(userTable)
      .set({ role: "superadmin" })
      .where(eq(userTable.email, email));
    console.log(c("green", `✓ ${u.name} promoted to superadmin`));
    process.exit(0);
  }

  // Create new user via Better Auth API
  const name = await prompt("Name:");
  if (!name) {
    console.log(c("red", "✗ Name required"));
    process.exit(1);
  }
  const password = await prompt("Password:", true);
  if (!password || password.length < 8) {
    console.log(c("red", "✗ Password must be 8+ characters"));
    process.exit(1);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${appUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: appUrl,
    },
    body: JSON.stringify({ email, password, name }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.log(c("red", `✗ Registration failed: ${body}`));
    process.exit(1);
  }

  // Promote to superadmin
  await db
    .update(userTable)
    .set({ role: "superadmin" })
    .where(eq(userTable.email, email));

  console.log(c("green", `✓ Created superadmin: ${name} <${email}>`));
  console.log(`  Login at: ${appUrl}/login`);
  console.log(`  Owner console: ${appUrl}/owner\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(c("red", `✗ ${err}`));
  process.exit(1);
});
