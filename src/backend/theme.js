// Tenant-isolated UI theming: ui_theme / ui_accent / panel_name live in
// mod_settings scoped by panel_code — never a global.

export const THEMES = ['blue', 'cherry', 'gold', 'emerald', 'violet', 'orange', 'cyan', 'mono'];

export async function getTheme(db, pc) {
  try { const r = await db.prepare("SELECT setting_value FROM mod_settings WHERE setting_name='ui_theme' AND panel_code=?").bind(pc).first(); if (r && (THEMES.includes(r.setting_value) || r.setting_value === 'custom')) return r.setting_value; } catch {}
  return 'blue';
}

export const HEX6 = /^#[0-9a-f]{6}$/;

export function shadeHex(hex, p) { // p in [-1,1]: negative darkens toward black, positive tints toward white
  const n = parseInt(hex.slice(1), 16);
  const t = p < 0 ? 0 : 255, k = Math.abs(Math.max(-1, Math.min(1, p)));
  const r = Math.round(((n >> 16) & 255) + (t - ((n >> 16) & 255)) * k);
  const g = Math.round(((n >> 8) & 255) + (t - ((n >> 8) & 255)) * k);
  const b = Math.round((n & 255) + (t - (n & 255)) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function glowHex(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

export async function getAccent(db, pc) {
  try {
    const t = await db.prepare("SELECT setting_value FROM mod_settings WHERE setting_name='ui_theme' AND panel_code=?").bind(pc).first();
    if (!t || t.setting_value !== 'custom') return null;
    const a = await db.prepare("SELECT setting_value FROM mod_settings WHERE setting_name='ui_accent' AND panel_code=?").bind(pc).first();
    const hex = String(a?.setting_value || '').trim().toLowerCase();
    if (!HEX6.test(hex)) return null;
    return { acc: hex, accD: shadeHex(hex, -0.18), accSoft: shadeHex(hex, 0.88), glow: glowHex(hex, 0.2) };
  } catch { return null; }
}

export async function panelName(db, pc, fallback) {
  try { const r = await db.prepare("SELECT setting_value FROM mod_settings WHERE setting_name='panel_name' AND panel_code=?").bind(pc).first(); if (r && r.setting_value) return r.setting_value; } catch {}
  return fallback;
}
