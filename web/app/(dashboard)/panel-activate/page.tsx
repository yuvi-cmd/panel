'use client';

import { useState } from 'react';
import { Button, Card, CardBody, Input, Label, useToast } from '@/components/ui';
import { PageHeader } from '@/components/dashboard';
import { api, ApiError } from '@/lib/api';

// Panel activation: redeem a time voucher for YOUR panel. The backend binds
// the voucher to your session's panel_code — panel codes can't be swapped.
export default function PanelActivatePage() {
  const { push } = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setResult('');
    try {
      const r = await api.activate(code.trim().toUpperCase());
      setResult(`Activated${r.expires_at_ist ? ` till ${r.expires_at_ist}` : ''}.`);
      push('success', r.message || 'Panel activated.');
      setCode('');
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Redeem failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Activate panel" sub="Redeem an activation voucher for your panel." />
      <Card className="max-w-xl">
        <CardBody>
          <form onSubmit={redeem} className="space-y-3">
            <div>
              <Label htmlFor="pk">Activation key</Label>
              <Input id="pk" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXXXX" className="text-center font-mono text-base font-bold tracking-widest" required />
            </div>
            <Button type="submit" disabled={busy || !code.trim()} className="w-full">{busy ? 'Redeeming…' : 'Redeem'}</Button>
          </form>
          {result && <p className="mt-3 rounded-md2 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">{result}</p>}
        </CardBody>
      </Card>
    </div>
  );
}
