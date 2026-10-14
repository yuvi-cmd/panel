export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// Format a UTC "YYYY-MM-DD HH:MM:SS" stamp for Asia/Kolkata display.
// The Worker also returns pre-formatted `_ist` fields; this is a fallback.
export function formatIST(s: string | null | undefined): string {
  if (!s) return '—';
  const ms = Date.parse(String(s).replace(' ', 'T') + 'Z');
  if (Number.isNaN(ms)) return String(s);
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(ms));
  } catch {
    return String(s);
  }
}

export async function deviceInfo(): Promise<string> {
  try {
    const payload = JSON.stringify({
      screen: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: window.navigator.platform,
      ua_ch: (window.navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || '',
    });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '{}';
  }
}
