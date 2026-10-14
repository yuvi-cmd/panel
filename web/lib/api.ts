// Typed API client for the Cloudflare Worker JSON API (worker/src/api.js).
// Auth uses the HttpOnly `sdk_session` cookie set by the Worker, so every
// request uses `credentials: 'include'`. For cross-origin deployments set
// NEXT_PUBLIC_API_BASE to the Worker origin and FRONTEND_ORIGIN on the Worker.

import type { ApiKey, DashboardStats, ManagedUser, Panel, Referral, ServerConfig, User } from '@/types';

const BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init,
    });
  } catch {
    throw new ApiError('Backend unreachable. Check NEXT_PUBLIC_API_BASE and CORS.', 0);
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(`Unexpected response (HTTP ${res.status}).`, res.status);
  }
  if (!res.ok || body.ok === false) {
    const msg = typeof body.error === 'string' && body.error
      ? body.error
      : typeof body.message === 'string' && body.message
        ? body.message
        : `Request failed (HTTP ${res.status}).`;
    throw new ApiError(msg, res.status, typeof body.error === 'string' ? body.error : undefined);
  }
  return body as T;
}

export const api = {
  health: () => req<{ ok: boolean; panel: string }>('/api/health'),
  login: (username: string, password: string, device_info: string) =>
    req<{ ok: boolean; user: User }>('/api/login', { method: 'POST', body: JSON.stringify({ username, password, device_info }) }),
  logout: () => req<{ ok: boolean }>('/api/logout', { method: 'POST', body: '{}' }),
  me: () => req<{ ok: boolean; user: User }>('/api/me'),
  dashboard: () => req<{ ok: boolean; user: User; balance: number | null; stats: DashboardStats }>('/api/dashboard'),
  pricing: () => req<{ ok: boolean; pricing: Record<string, number>; durations: string[] }>('/api/pricing'),

  keys: (params: { search?: string; status?: string; server?: string; page?: number; pageSize?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.server) q.set('server', params.server);
    q.set('page', String(params.page || 1));
    q.set('pageSize', String(params.pageSize || 20));
    return req<{ ok: boolean; items: ApiKey[]; total: number; page: number; pageSize: number }>(`/api/keys?${q}`);
  },
  keyAction: (body: Record<string, unknown>) =>
    req<{ ok: boolean; message?: string }>('/api/keys', { method: 'POST', body: JSON.stringify(body) }),

  generate: (body: { duration: string; device_limit: number; bulk_amount: number; custom_key?: string; server_type?: string }) =>
    req<{ ok: boolean; keys: string[]; charged: number }>('/api/generate', { method: 'POST', body: JSON.stringify(body) }),

  users: () => req<{ ok: boolean; items: ManagedUser[] }>('/api/users'),
  userAction: (body: Record<string, unknown>) =>
    req<{ ok: boolean; message?: string }>('/api/users', { method: 'POST', body: JSON.stringify(body) }),

  referrals: () => req<{ ok: boolean; items: Referral[] }>('/api/referral'),
  referralAction: (body: Record<string, unknown>) =>
    req<{ ok: boolean; code?: string }>('/api/referral', { method: 'POST', body: JSON.stringify(body) }),

  server: () => req<{ ok: boolean } & ServerConfig>('/api/server'),
  saveServer: (body: Record<string, unknown>) =>
    req<{ ok: boolean; message?: string }>('/api/server', { method: 'POST', body: JSON.stringify(body) }),

  changePassword: (current_password: string, new_password: string) =>
    req<{ ok: boolean; message?: string }>('/api/settings/password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),

  aesStatus: () => req<{ ok: boolean; configured: boolean; expiry: string | null; expiry_ist: string | null }>('/api/aes-status'),
  activate: (activation_key: string) =>
    req<{ ok: boolean; message?: string; expires_at?: string; expires_at_ist?: string }>('/api/activate', { method: 'POST', body: JSON.stringify({ activation_key }) }),
  anticrack: () => req<{
    ok: boolean;
    device_binding: { bound_devices: number; note: string };
    device_lock: { enabled: boolean; note: string };
    lib_hashes: Array<{ engine: string; total: number; active: number }>;
  }>('/api/anticrack'),

  panels: () => req<{ ok: boolean; items: Panel[] }>('/api/panels'),
  panelAction: (body: Record<string, unknown>) =>
    req<{ ok: boolean; panel_code?: string }>('/api/panels', { method: 'POST', body: JSON.stringify(body) }),

  // Direct client-API calls (game client contract, unchanged).
  connect: (panelCode: string, form: FormData) => fetch(`${BASE}/connect/${encodeURIComponent(panelCode)}`, { method: 'POST', body: form }),
  encrypt: (panelCode: string, form: FormData) => fetch(`${BASE}/encrypt/${encodeURIComponent(panelCode)}`, { method: 'POST', body: form }),
};

export function apiBase(): string {
  return BASE;
}
