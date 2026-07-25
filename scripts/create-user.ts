/**
 * Admin account provisioning. There is no public signup route - this is the
 * only way new accounts get created.
 *
 * Run with: npm run create-user -- --email x@y.com --name "X" [--role admin]
 *
 * Generates a random password rather than accepting one as an argument (a
 * password typed on the command line ends up in shell history). Prints it
 * once - write it down, it is not stored anywhere in plaintext and cannot be
 * recovered later.
 */
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { loadEnv } from "./lib/env.mjs";

// Must run before lib/db.ts is ever imported - it reads process.env.turso_url
// synchronously at module load, so .env.local has to be loaded first (tsx,
// unlike `next dev`, does not auto-load .env.local).
loadEnv();

function parseArgs(argv: string[]): {
  email?: string;
  name?: string;
  role?: string;
} {
  const out: { email?: string; name?: string; role?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") out.email = argv[++i];
    else if (arg === "--name") out.name = argv[++i];
    else if (arg === "--role") out.role = argv[++i];
  }
  return out;
}

function generatePassword(): string {
  return crypto.randomBytes(12).toString("base64url");
}

async function main() {
  const { ensureMigrated } = await import("../lib/db");
  const { createUser, getUserByEmail } = await import("../lib/data");

  await ensureMigrated();

  const { email, name, role } = parseArgs(process.argv.slice(2));

  if (!email) {
    console.error("Usage: npm run create-user -- --email x@y.com [--name \"X\"] [--role admin]");
    process.exit(1);
  }
  if (role && role !== "admin" && role !== "member") {
    console.error(`Invalid --role "${role}" - must be "admin" or "member".`);
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    console.error(`A user with email ${normalizedEmail} already exists (id ${existing.id}).`);
    process.exit(1);
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await createUser({
    email: normalizedEmail,
    passwordHash,
    name: name ?? null,
    role: (role as "admin" | "member" | undefined) ?? "member",
  });

  console.log(`Created user #${user.id} <${user.email}> (role: ${user.role})`);
  console.log(`Temporary password: ${password}`);
  console.log("Write this down now - it is not recoverable later.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
