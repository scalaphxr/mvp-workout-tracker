import { coachClients, type Db } from '@mvp/db';
import { and, eq, isNull } from '@mvp/db';

/**
 * The one place that decides whether `viewerId` may read and write the data of `ownerId`
 * (spec, section 3): the owner, or a trainer with an active link to the client.
 */
export async function canAccess(db: Db, viewerId: string, ownerId: string): Promise<boolean> {
  if (viewerId === ownerId) return true;

  const [link] = await db
    .select({ id: coachClients.id })
    .from(coachClients)
    .where(
      and(
        eq(coachClients.coachId, viewerId),
        eq(coachClients.clientId, ownerId),
        eq(coachClients.status, 'active'),
        isNull(coachClients.deletedAt),
      ),
    )
    .limit(1);
  return link !== undefined;
}
