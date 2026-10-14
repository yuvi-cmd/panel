'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setOk(true);
    window.setTimeout(() => setOk(false), 1500);
  }
  return (
    <button onClick={copy} aria-label={`${label}: ${text.slice(0, 24)}`} title={label} className="rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-ink">
      {ok ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}
