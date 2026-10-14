'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ user: null, loading: true, refresh: async () => {}, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await api.me();
      setUser(r.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ user, loading, refresh, logout }), [user, loading, refresh, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  return useContext(Ctx);
}

export function roleRank(role: string | undefined): number {
  const order: Record<string, number> = { PROFESSOR: 4, OWNER: 3, ADMIN: 2, RESELLER: 1 };
  return order[String(role || '').toUpperCase()] || 0;
}
