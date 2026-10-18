import { and, type Db, eq, gt, supportMessages, users } from '@mvp/db';
import type { SupportRequest } from '@mvp/schemas';
import { v7 as uuidv7 } from 'uuid';

import { rateLimited } from './errors';
import type { Mailer } from './mailer';

/** Messages one address may send in an hour: enough for a person, too few for a bot. */
export const MAX_SUPPORT_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

export interface SupportDeps {
  db: Db;
  mailer: Mailer;
  now: () => Date;
}

/**
 * A message from the support form (spec: "Поддержка"). It is kept, and sent on to the support
 * address when there is one; the answer goes to the email of the message or of the account.
 */
export async function sendSupportMessage(
  deps: SupportDeps,
  input: SupportRequest & { message: string },
  caller: { userId: string | null; ip: string | null },
): Promise<void> {
  const now = deps.now();
  const ip = caller.ip ?? 'unknown';
  const recent = await deps.db
    .select({ id: supportMessages.id })
    .from(supportMessages)
    .where(
      and(eq(supportMessages.ip, ip), gt(supportMessages.createdAt, new Date(now.getTime() - HOUR_MS))),
    );
  if (recent.length >= MAX_SUPPORT_PER_HOUR) throw rateLimited(60 * 60);

  const [user] = caller.userId
    ? await deps.db.select({ email: users.email }).from(users).where(eq(users.id, caller.userId))
    : [];
  const email = input.email ?? user?.email ?? null;
  const row = {
    id: uuidv7(),
    userId: user ? caller.userId : null,
    email,
    message: input.message,
    appVersion: input.app_version,
    device: input.device,
    lastSyncAt: input.last_sync_at ? new Date(input.last_sync_at) : null,
    locale: input.locale,
    ip,
    createdAt: now,
  };
  await deps.db.insert(supportMessages).values(row);

  // The message is kept whatever happens to the email: nothing is lost if SMTP is down.
  await deps.mailer
    .sendSupportMessage?.({
      id: row.id,
      email,
      message: row.message,
      details: [
        `App: ${row.appVersion}`,
        `Device: ${row.device}`,
        `Last sync: ${input.last_sync_at ?? 'never'}`,
        `Locale: ${row.locale}`,
        `Account: ${row.userId ?? 'guest'}`,
      ],
    })
    .catch((error: unknown) => console.error('Support email failed', error));
}
