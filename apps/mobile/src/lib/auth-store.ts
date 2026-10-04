import type { Tokens } from '@mvp/schemas';
import { create } from 'zustand';

import { secureStorage } from './storage';

const STORAGE_KEY = 'auth.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  /** `null` – guest: the app works without an account, data lives only on the phone. */
  session: Session | null;
  setSession(tokens: Pick<Tokens, 'access_token' | 'refresh_token'>): void;
  clearSession(): void;
}

function readSession(): Session | null {
  try {
    const raw = secureStorage.get(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: readSession(),
  setSession(tokens) {
    const session = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
    secureStorage.set(STORAGE_KEY, JSON.stringify(session));
    set({ session });
  },
  clearSession() {
    secureStorage.remove(STORAGE_KEY);
    set({ session: null });
  },
}));
