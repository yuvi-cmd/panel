'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardBody, Input, Label, useToast } from '@/components/ui';
import { PageHeader } from '@/components/dashboard';
import { api, ApiError, apiBase } from '@/lib/api';

// Encryption / access-code page. Secrets NEVER enter the client bundle:
// this page only reads status booleans + expiry, and redeems activation
// vouchers. Key rotation stays on the Worker's /aes route (main owner).
export default function EncApiPage() {
  const { push } = useToast();
  const [status, setStatus] = useState<{ configured: boolean; expiry: string | null; expiry_ist: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.aesStatus()
      .then(setStatus)
      .catch((e) => push('error', e instanceof ApiError ? e.message : 'Could not load encryption status.'))
      .finally(() => setLoading(false));
  }, [push]);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const r = await api.activate(code.trim().toUpperCase());
      push('success', r.message || 'Panel activated.');
      const s = await api.aesStatus();
      setStatus(s);
      setCode('');
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Redeem failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Encryption" sub="Access codes and panel activation. Secrets stay server-side." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">AES status</h2>
            {loading ? (
              <p className="mt-2 text-sm text-muted">Loading…</p>
            ) : status ? (
              <div className="mt-2 space-y-2 text-sm">
                <p>Payload encryption: {status.configured ? <Badge tone="green">Configured</Badge> : <Badge tone="red">Not configured</Badge>}</p>
                <p className="text-muted">Panel expiry: <span className="font-semibold text-ink">{status.expiry_ist || status.expiry || 'Not activated'}</span></p>
                <p className="text-xs text-muted">The /encrypt API requires an active panel and configured AES keys.</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-red-600">Unavailable.</p>
            )}
            <a href={`${apiBase()}/aes`} target="_blank" rel="noreferrer">
              <Button variant="outline" className="mt-3 w-full">Open key management (Worker /aes)</Button>
            </a>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Redeem activation code</h2>
            <form onSubmit={redeem} className="mt-3 space-y-3">
              <div>
                <Label htmlFor="ac">Activation key</Label>
                <Input id="ac" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXXXX" className="text-center font-mono font-bold tracking-widest" />
              </div>
              <Button type="submit" disabled={busy || !code.trim()} className="w-full">{busy ? 'Redeeming…' : 'Redeem'}</Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
