// Shared TypeScript types. Mirror the Worker D1 schema + /api/* responses.
// Never put tokens, AES keys/IVs or master secrets in these types.

export type Role = 'PROFESSOR' | 'OWNER' | 'ADMIN' | 'RESELLER';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  panel_code: string;
  balance: number | null;
  unlimited: boolean;
}

export interface ApiKey {
  id: number;
  key_value: string;
  duration: string;
  device_limit: number;
  uses: number;
  expires_at: string | null;
  expires_at_ist: string | null;
  expired: boolean;
  panel_code: string;
  is_active: number;
  is_blocked: number;
  created_by: number;
  server_type: 'PRIVATE' | 'PUBLIC' | 'ADMIN' | 'SAFE';
  dev_count: number;
  creator: string | null;
}

export interface ManagedUser {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  balance: number;
  is_blocked: boolean;
  invited: string | null;
  validity: string | null;
  validity_ist: string | null;
  last_login: string | null;
}

export interface Referral {
  code: string;
  role: string;
  duration: number;
  balance: number;
  panel_code: string;
  created_by: number | null;
  used: number;
}

export interface ServerConfig {
  settings: Record<string, string>;
  maintenance: { on: boolean; reason: string };
}

export interface DashboardStats {
  [k: string]: number | string | undefined;
}

export interface Panel {
  panel_code: string;
  duration: number;
  expires_at: string | null;
  is_active: number;
  total_users?: number;
  total_keys?: number;
}

export interface ApiResult<T = unknown> {
  ok: boolean;
  error?: string;
  message?: string;
  [k: string]: unknown;
  data?: T;
}
