import { create } from 'zustand';

import { getSyncState, pendingCount, runSync, setSyncState, wipeLocalData } from '@/data/sync';
import i18n from '@/i18n';

import { api } from './api';
import { useAuthStore } from './auth-store';
import { useCatalog } from './catalog';
import { data } from './db';
import { ensureDefaultGym } from './gym';
import { mutate, useActiveProgram } from './local';
import { settingsStorage } from './storage';

const DEVICE_ID_KEY = 'device.id';
const ACCOUNT_KEY = 'account_id';
const SYNCED_AT_KEY = 'synced_at';

function deviceId(): string {
  let id = settingsStorage.get(DEVICE_ID_KEY);
  if (!id) {
    id = data().newId();
    settingsStorage.set(DEVICE_ID_KEY, id);
  }
  return id;
}

/** The user id inside an access token (its `sub`), without checking the signature. */
function accountOf(accessToken: string): string | null {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'failed'
  /** The data on this phone belongs to another account: it is not mixed into this one. */
  | 'other_account';

export const useSync = create<{ status: SyncStatus; syncedAt: string | null }>(() => ({
  status: 'idle',
  syncedAt: null,
}));

let running: Promise<void> | null = null;

/**
 * Sends what is waiting and takes what is new, in the background. Does nothing for a guest.
 * Calls made while a sync is running share it. Resolves either way; rejects only when
 * `strict` and the server could not be reached – for actions that need the server to be up
 * to date (sharing a program).
 */
export function syncNow(strict = false): Promise<void> {
  const attempt = (running ??= sync().finally(() => {
    running = null;
  }));
  return strict ? attempt : attempt.catch(() => {});
}

async function sync(): Promise<void> {
  const session = useAuthStore.getState().session;
  if (!session) return;
  const ctx = data();

  // The first account to sync on a phone owns its data. Another account signing in on the
  // same phone must not upload that data as its own.
  const account = accountOf(session.accessToken);
  const owner = getSyncState(ctx, ACCOUNT_KEY);
  if (owner && account && owner !== account) {
    useSync.setState({ status: 'other_account' });
    return;
  }

  useSync.setState({ status: 'syncing' });
  try {
    const { pulled } = await runSync(ctx, {
      push: (changes) => api.syncPush(deviceId(), changes),
      pull: (cursor) => api.syncPull(cursor),
    });
    if (account) setSyncState(ctx, ACCOUNT_KEY, account);
    const syncedAt = ctx.now();
    setSyncState(ctx, SYNCED_AT_KEY, syncedAt);
    useSync.setState({ status: 'idle', syncedAt });
    // Rows from the server changed the database behind the screens: let them read again.
    if (pulled > 0) mutate(() => {});
  } catch (error) {
    useSync.setState({ status: 'failed' });
    throw error;
  }
}

/**
 * Deletes the account on the server, then everything of it on this phone: the app starts over
 * as on the first launch. Nothing is touched on the phone unless the server has done its part,
 * and data on the phone that belongs to another account stays.
 */
export async function deleteAccount(): Promise<void> {
  const session = useAuthStore.getState().session;
  if (!session) return;
  // A sync on its way would push rows after the account is gone or pull them back in.
  await running?.catch(() => {});
  await api.deleteAccount();

  // Data of another account on this phone (see `other_account`) is not this account's to delete.
  const owner = getSyncState(data(), ACCOUNT_KEY);
  if (owner === null || owner === accountOf(session.accessToken)) {
    mutate((ctx) => {
      wipeLocalData(ctx);
      ensureDefaultGym(ctx, useCatalog.getState().catalog, i18n.t('gym.defaultName'));
    });
    useActiveProgram.getState().set(null);
    useSync.setState({ syncedAt: null });
  }
  useSync.setState({ status: 'idle' });
  useAuthStore.getState().clearSession();
}

/** What the profile shows about sync, read once the database is open. */
export function loadSyncInfo(): void {
  useSync.setState({ syncedAt: getSyncState(data(), SYNCED_AT_KEY) });
}

export const pendingRows = () => pendingCount(data());
