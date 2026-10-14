'use client';

import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/bits';
import { Button, Card, CardBody, Input, Label, Select, useToast } from '@/components/ui';
import { PageHeader } from '@/components/dashboard';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const DURATIONS = ['2H', '1D', '3D', '7D', '15D', '30D', '60D'];

export default function GeneratePage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [pricing, setPricing] = useState<Record<string, number>>({});
  const [duration, setDuration] = useState('30D');
  const [devices, setDevices] = useState(1);
  const [qty, setQty] = useState(1);
  const [custom, setCustom] = useState('');
  const [server, setServer] = useState('PRIVATE');
  const [keys, setKeys] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const isOwnerLike = user?.role === 'OWNER' || user?.role === 'PROFESSOR';

  useEffect(() => {
    api.pricing().then((r) => setPricing(r.pricing)).catch(() => setPricing({ '2H': 10, '1D': 80, '3D': 150, '7D': 250, '15D': 350, '30D': 500, '60D': 900 }));
  }, []);

  const total = (pricing[duration] || 0) * devices * qty;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (qty === 1 && custom.trim() && custom.trim().length > 50) {
      push('error', 'Custom key must be 50 characters or fewer.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.generate({
        duration,
        device_limit: devices,
        bulk_amount: qty,
        custom_key: qty === 1 ? custom.trim() || undefined : undefined,
        server_type: server,
      });
      setKeys(r.keys);
      push('success', `${r.keys.length} key(s) generated${r.charged ? ` — Rs ${r.charged} charged` : ''}.`);
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Generation failed.');
    } finally {
      setBusy(false);
    }
  }

  function copyAll() {
    navigator.clipboard.writeText(keys.join('\n')).then(
      () => push('success', 'All keys copied.'),
      () => push('error', 'Copy failed.'),
    );
  }

  return (
    <div>
      <PageHeader title="Generate keys" sub={isOwnerLike ? 'Unlimited generation.' : 'Cost is deducted from your balance.'} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="dur">Duration / plan</Label>
                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Duration">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="radio"
                      aria-checked={duration === d}
                      onClick={() => setDuration(d)}
                      className={`rounded-md2 border px-2 py-2 text-center text-sm font-bold ${duration === d ? 'border-accent bg-accent-light text-accent-dark' : 'border-line bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      {d}
                      <span className="block text-[10px] font-semibold opacity-80">Rs {pricing[d] ?? '…'}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="dev">Device limit (1–10)</Label>
                  <Input id="dev" type="number" min={1} max={10} value={devices} onChange={(e) => setDevices(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
                </div>
                <div>
                  <Label htmlFor="qty">Quantity (1–500)</Label>
                  <Input id="qty" type="number" min={1} max={500} value={qty} onChange={(e) => setQty(Math.min(500, Math.max(1, Number(e.target.value) || 1)))} />
                </div>
              </div>
              <div>
                <Label htmlFor="custom">Custom key (single key only)</Label>
                <Input id="custom" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={50} placeholder="Leave empty for auto key" disabled={qty > 1} className="font-mono" />
              </div>
              {isOwnerLike && (
                <div>
                  <Label htmlFor="srv">Server type</Label>
                  <Select id="srv" value={server} onChange={(e) => setServer(e.target.value)}>
                    <option>PRIVATE</option><option>PUBLIC</option><option>ADMIN</option><option>SAFE</option>
                  </Select>
                </div>
              )}
              <div className="flex items-center justify-between rounded-md2 border border-line bg-slate-50 px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">Total cost</span>
                <span className="text-xl font-bold text-ink">Rs {isOwnerLike ? 0 : total}</span>
              </div>
              <Button type="submit" disabled={busy} className="w-full">{busy ? 'Generating…' : 'Generate'}</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">Results {keys.length > 0 && `(${keys.length})`}</h2>
              {keys.length > 0 && <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={copyAll}>Copy all</Button>}
            </div>
            {keys.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Generated keys appear here. Only confirmed backend results are shown.</p>
            ) : (
              <ul className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                {keys.map((k) => (
                  <li key={k} className="flex items-center gap-2 rounded-md2 border border-line bg-slate-50 px-3 py-2">
                    <code className="flex-1 break-all font-mono text-[13px] font-semibold">{k}</code>
                    <CopyButton text={k} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
