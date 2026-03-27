import { usersTable } from "../db/schema";
import db from "../db";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

export interface AuthTokenPayload {
  userId: number;
}

/**
 * Hash a password using Bun's built-in crypto
 */
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

/**
 * Get user by ID
 */
export async function getUserById(userId: number): Promise<typeof usersTable.$inferSelect | null> {
  const user = await db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) });
  return user ?? null;
}

export function generateApiKey(): string {
  return `pm_${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export async function getUserByApiKey(
  apiKey: string,
): Promise<typeof usersTable.$inferSelect | null> {
  const apiKeyHash = hashApiKey(apiKey);
  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.apiKeyHash, apiKeyHash),
  });
  return user ?? null;
}
