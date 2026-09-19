import { LoginRequestSchema } from '@idosi/contracts';
import { closeDatabase, db, users } from '@idosi/database';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { hashPassword } from './security.js';

const BootstrapInputSchema = LoginRequestSchema.extend({
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(6).max(256),
});

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required');
  const input = BootstrapInputSchema.parse({
    username: process.env.BOOTSTRAP_ADMIN_USERNAME,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    displayName: process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME,
  });

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, input.username), isNull(users.deletedAt)))
    .limit(1);
  if (existing) {
    throw new Error(
      'An active account with BOOTSTRAP_ADMIN_USERNAME already exists; no changes were made.',
    );
  }

  const passwordHash = await hashPassword(input.password);
  const [created] = await db
    .insert(users)
    .values({
      displayName: input.displayName,
      email: input.username,
      passwordHash,
      role: 'admin',
      status: 'active',
      storeId: null,
    })
    .returning({ id: users.id, username: users.email });
  if (!created) throw new Error('Admin bootstrap insert did not return an account');

  process.stdout.write(
    `${JSON.stringify({ event: 'bootstrap_admin_created', accountId: created.id, username: created.username })}\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({ event: 'bootstrap_admin_failed', error: error instanceof Error ? error.message : String(error) })}\n`,
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
