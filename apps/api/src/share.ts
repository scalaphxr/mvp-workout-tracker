import { randomBytes } from 'node:crypto';

import {
  type Db,
  equipment,
  gymEquipment,
  gymProfiles,
  programDays,
  programItems,
  programs,
  programShares,
  shareCodeAttempts,
} from '@mvp/db';
import { generateShareCode, normalizeShareCode, planSubstitutions } from '@mvp/domain';
import type {
  AdoptResponse,
  Exercise,
  ProgramDayRow,
  ProgramItemRow,
  ProgramRow,
  ProgramTree,
  ShareCode,
} from '@mvp/schemas';
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from '@mvp/db';
import { v7 as uuidv7 } from 'uuid';

import { ApiError, rateLimited } from './errors';
import { toColumns, toWire } from './sync';

export const MAX_ATTEMPTS_PER_MINUTE = 10;
export const MAX_FAILURES_PER_HOUR = 30;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface ShareDeps {
  db: Db;
  now: () => Date;
  /** Exercises of the current catalog: what replacements are picked from. */
  exercises: () => Promise<readonly Exercise[]>;
}

/** Who is entering a code: limits against guessing are counted per user and per address. */
export interface Caller {
  userId: string;
  /** `null` when the address is unknown. */
  ip: string | null;
}

const invalidCode = () =>
  new ApiError(404, 'invalid_share_code', 'The code is wrong, expired or revoked');
const noProgram = () => new ApiError(404, 'not_found', 'No such program');

const iso = (date: Date | null) => (date === null ? null : date.toISOString());

const toShareCode = (row: typeof programShares.$inferSelect): ShareCode => ({
  code: row.code,
  program_id: row.programId,
  expires_at: iso(row.expiresAt),
  created_at: row.createdAt.toISOString(),
  uses_count: row.usesCount,
});

export function createShareService(deps: ShareDeps) {
  const { db } = deps;

  async function ownProgram(userId: string, programId: string) {
    const [program] = await db
      .select()
      .from(programs)
      .where(
        and(eq(programs.id, programId), eq(programs.ownerId, userId), isNull(programs.deletedAt)),
      );
    if (!program) throw noProgram();
    return program;
  }

  /** The program with its days and items, without what was deleted. */
  async function loadTree(program: typeof programs.$inferSelect): Promise<ProgramTree> {
    const days = await db
      .select()
      .from(programDays)
      .where(and(eq(programDays.programId, program.id), isNull(programDays.deletedAt)))
      .orderBy(asc(programDays.position));
    const items =
      days.length === 0
        ? []
        : await db
            .select()
            .from(programItems)
            .where(
              and(
                inArray(
                  programItems.programDayId,
                  days.map((day) => day.id),
                ),
                isNull(programItems.deletedAt),
              ),
            )
            .orderBy(asc(programItems.position));

    return {
      program: toWire('programs', program),
      days: days.map((day) => toWire('program_days', day)),
      items: items.map((item) => toWire('program_items', item)),
    };
  }

  /** Limits against guessing codes (spec 6.8). */
  async function checkLimits(caller: Caller, now: Date) {
    const mine = caller.ip
      ? or(eq(shareCodeAttempts.userId, caller.userId), eq(shareCodeAttempts.ip, caller.ip))
      : eq(shareCodeAttempts.userId, caller.userId);

    const lastMinute = await db
      .select({ createdAt: shareCodeAttempts.createdAt })
      .from(shareCodeAttempts)
      .where(and(mine, gt(shareCodeAttempts.createdAt, new Date(now.getTime() - MINUTE_MS))))
      .orderBy(asc(shareCodeAttempts.createdAt));
    const freesUp = lastMinute[lastMinute.length - MAX_ATTEMPTS_PER_MINUTE];
    if (freesUp) throw rateLimited(secondsUntil(freesUp.createdAt, MINUTE_MS, now));

    const failures = await db
      .select({ createdAt: shareCodeAttempts.createdAt })
      .from(shareCodeAttempts)
      .where(
        and(
          mine,
          eq(shareCodeAttempts.succeeded, false),
          gt(shareCodeAttempts.createdAt, new Date(now.getTime() - HOUR_MS)),
        ),
      )
      .orderBy(desc(shareCodeAttempts.createdAt));
    // 30 wrong codes within an hour block entering until the 30th most recent is an hour old.
    const thirtieth = failures[MAX_FAILURES_PER_HOUR - 1];
    if (thirtieth) throw rateLimited(secondsUntil(thirtieth.createdAt, HOUR_MS, now));
  }

  const secondsUntil = (from: Date, windowMs: number, now: Date) =>
    Math.max(1, Math.ceil((from.getTime() + windowMs - now.getTime()) / 1000));

  /** Finds the program behind a code the user typed, counting the attempt. */
  async function resolve(caller: Caller, input: string) {
    const now = deps.now();
    await checkLimits(caller, now);

    const code = normalizeShareCode(input);
    const [found] = code
      ? await db
          .select({ share: programShares, program: programs })
          .from(programShares)
          .innerJoin(programs, eq(programs.id, programShares.programId))
          .where(
            and(
              eq(programShares.code, code),
              isNull(programShares.revokedAt),
              or(isNull(programShares.expiresAt), gt(programShares.expiresAt, now)),
              isNull(programs.deletedAt),
            ),
          )
      : [];

    await db.insert(shareCodeAttempts).values({
      id: uuidv7(),
      userId: caller.userId,
      ip: caller.ip ?? '',
      succeeded: found !== undefined,
      createdAt: now,
    });
    if (!found) throw invalidCode();
    return found;
  }

  return {
    async create(userId: string, programId: string, expiresInDays: 7 | 30 | null): Promise<ShareCode> {
      await ownProgram(userId, programId);
      const now = deps.now();

      // A clash of two random codes is next to impossible, yet the code must be unique.
      for (let attempt = 0; attempt < 5; attempt++) {
        const [created] = await db
          .insert(programShares)
          .values({
            code: generateShareCode(randomBytes(5)),
            programId,
            createdBy: userId,
            expiresAt: expiresInDays === null ? null : new Date(now.getTime() + expiresInDays * DAY_MS),
            createdAt: now,
          })
          .onConflictDoNothing()
          .returning();
        if (created) return toShareCode(created);
      }
      throw new Error('Could not generate a unique share code');
    },

    /** Codes of the user's program that still work. */
    async list(userId: string, programId: string): Promise<ShareCode[]> {
      await ownProgram(userId, programId);
      const now = deps.now();
      const rows = await db
        .select()
        .from(programShares)
        .where(
          and(
            eq(programShares.programId, programId),
            isNull(programShares.revokedAt),
            or(isNull(programShares.expiresAt), gt(programShares.expiresAt, now)),
          ),
        )
        .orderBy(desc(programShares.createdAt));
      return rows.map(toShareCode);
    },

    async revoke(userId: string, input: string): Promise<void> {
      const code = normalizeShareCode(input);
      const revoked = code
        ? await db
            .update(programShares)
            .set({ revokedAt: deps.now() })
            .where(
              and(
                eq(programShares.code, code),
                eq(programShares.createdBy, userId),
                isNull(programShares.revokedAt),
              ),
            )
            .returning({ code: programShares.code })
        : [];
      if (revoked.length === 0) throw new ApiError(404, 'not_found', 'No such code');
    },

    async preview(caller: Caller, input: string) {
      const { share, program } = await resolve(caller, input);
      return { tree: await loadTree(program), expires_at: iso(share.expiresAt) };
    },

    /**
     * "Take it": a copy of the program that belongs to the caller. Exercises their gym has
     * no equipment for are replaced; later edits of the original do not reach the copy.
     */
    async adopt(caller: Caller, input: string, gymProfileId: string): Promise<AdoptResponse> {
      const [profile] = await db
        .select({ id: gymProfiles.id })
        .from(gymProfiles)
        .where(
          and(
            eq(gymProfiles.id, gymProfileId),
            eq(gymProfiles.ownerId, caller.userId),
            isNull(gymProfiles.deletedAt),
          ),
        );
      if (!profile) throw new ApiError(404, 'not_found', 'No such gym profile');

      const { share, program } = await resolve(caller, input);
      const source = await loadTree(program);
      const now = deps.now().toISOString();
      const fresh = { created_at: now, updated_at: now, deleted_at: null };

      const copy: ProgramRow = {
        ...source.program,
        ...fresh,
        id: uuidv7(),
        visibility: 'private',
        forked_from_id: program.id,
      };
      const dayIds = new Map(source.days.map((day) => [day.id, uuidv7()]));
      const days: ProgramDayRow[] = source.days.map((day) => ({
        ...day,
        ...fresh,
        id: dayIds.get(day.id) as string,
        program_id: copy.id,
      }));
      const items: ProgramItemRow[] = source.items.map((item) => ({
        ...item,
        ...fresh,
        id: uuidv7(),
        program_day_id: dayIds.get(item.program_day_id) as string,
      }));

      const owned = await db
        .select({ code: equipment.code })
        .from(gymEquipment)
        .innerJoin(equipment, eq(equipment.id, gymEquipment.equipmentId))
        .where(and(eq(gymEquipment.gymProfileId, gymProfileId), isNull(gymEquipment.deletedAt)));
      const substitutions = planSubstitutions(
        items,
        await deps.exercises(),
        new Set(owned.map((row) => row.code)),
      );
      for (const substitution of substitutions) {
        const item = items.find((candidate) => candidate.id === substitution.item_id);
        if (!item || substitution.to_exercise_id === null) continue;
        item.exercise_id = substitution.to_exercise_id;
        // The step was set for the equipment of the replaced exercise.
        item.increment_kg = null;
      }

      // The copy is new on the server, so the taker's other devices get it through sync pull.
      await db.transaction(async (tx) => {
        await tx
          .insert(programs)
          .values(toColumns('programs', copy, caller.userId) as typeof programs.$inferInsert);
        if (days.length > 0) {
          await tx
            .insert(programDays)
            .values(
              days.map(
                (day) =>
                  toColumns('program_days', day, caller.userId) as typeof programDays.$inferInsert,
              ),
            );
        }
        if (items.length > 0) {
          await tx
            .insert(programItems)
            .values(
              items.map(
                (item) =>
                  toColumns('program_items', item, caller.userId) as typeof programItems.$inferInsert,
              ),
            );
        }
        await tx
          .update(programShares)
          .set({ usesCount: sql`${programShares.usesCount} + 1` })
          .where(eq(programShares.code, share.code));
      });

      return { tree: { program: copy, days, items }, substitutions };
    },
  };
}
