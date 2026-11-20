import { formatIST } from './security.js';

// Data for the PROFESSOR-only console. The backend gate is in router.js;
// this module never writes anything.
export async function getProfessorData(db) {
  const totals = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM panels) AS panels,
         (SELECT COUNT(*) FROM panels WHERE is_active=1) AS active_panels,
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM api_keys) AS keys,
         (SELECT COUNT(*) FROM api_keys WHERE is_blocked=0) AS active_keys,
         (SELECT COUNT(*) FROM api_keys WHERE is_blocked=1) AS blocked_keys,
         (SELECT COUNT(*) FROM users WHERE role='ADMIN') AS admins,
         (SELECT COUNT(*) FROM users WHERE role='RESELLER') AS resellers,
         (SELECT COUNT(*) FROM users WHERE role='OWNER') AS owners,
         (SELECT COUNT(*) FROM users WHERE role='PROFESSOR') AS professors`
    )
    .first()
    .catch(() => ({}));

  const roles = await db
    .prepare('SELECT role, COUNT(*) AS c FROM users GROUP BY role ORDER BY c DESC')
    .all()
    .catch(() => ({ results: [] }));

  const panels = await db
    .prepare(
      `SELECT p.panel_code, p.is_active, p.expires_at, p.auto_join, p.account_limit,
              (SELECT COUNT(*) FROM users WHERE panel_code=p.panel_code) AS total_users,
              (SELECT COUNT(*) FROM api_keys WHERE panel_code=p.panel_code) AS total_keys
         FROM panels p
        ORDER BY p.panel_code`
    )
    .all()
    .catch(() => ({ results: [] }));

  const recentUsers = await db
    .prepare(
      `SELECT id, username, role, panel_code, last_login, is_blocked
         FROM users
        ORDER BY id DESC
        LIMIT 8`
    )
    .all()
    .catch(() => ({ results: [] }));

  const recentKeys = await db
    .prepare(
      `SELECT k.id, k.key_value, k.duration, k.panel_code, k.is_blocked,
              k.expires_at, u.username AS creator
         FROM api_keys k
         LEFT JOIN users u ON u.id = k.created_by
        ORDER BY k.id DESC
        LIMIT 8`
    )
    .all()
    .catch(() => ({ results: [] }));

  return {
    totals: {
      panels: totals?.panels | 0,
      active_panels: totals?.active_panels | 0,
      users: totals?.users | 0,
      keys: totals?.keys | 0,
      active_keys: totals?.active_keys | 0,
      blocked_keys: totals?.blocked_keys | 0,
      admins: totals?.admins | 0,
      resellers: totals?.resellers | 0,
      owners: totals?.owners | 0,
      professors: totals?.professors | 0,
    },
    roleDist: (roles.results || []).map((r) => ({
      role: String(r.role || ''),
      count: Number(r.c) || 0,
    })),
    panels: (panels.results || []).map((p) => ({
      ...p,
      total_users: Number(p.total_users) || 0,
      total_keys: Number(p.total_keys) || 0,
      expires_at_ist: formatIST(p.expires_at),
    })),
    recentUsers: (recentUsers.results || []).map((u) => ({
      ...u,
      last_login_ist: formatIST(u.last_login),
    })),
    recentKeys: (recentKeys.results || []).map((k) => ({
      ...k,
      expires_at_ist: formatIST(k.expires_at),
    })),
  };
}
