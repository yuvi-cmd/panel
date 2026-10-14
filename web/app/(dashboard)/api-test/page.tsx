'use client';

import { useState } from 'react';
import { Button, Card, CardBody, Input, Label, Select } from '@/components/ui';
import { PageHeader } from '@/components/dashboard';
import { apiBase } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function ApiTestPage() {
  const { user } = useAuth();
  const [key, setKey] = useState('');
  const [serial, setSerial] = useState('Test123');
  const [endpoint, setEndpoint] = useState<'connect' | 'encrypt'>('connect');
  const [out, setOut] = useState('— Press Send —');
  const [busy, setBusy] = useState(false);

  const base = apiBase();
  const panel = user?.panel_code || '';
  const url = `${base}/${endpoint}/${encodeURIComponent(panel)}`;

  async function run() {
    setBusy(true);
    setOut('••• sending •••');
    try {
      const fd = new FormData();
      fd.set('game', 'PUBG'); // game defaults to PUBG per panel contract
      fd.set('user_key', key);
      fd.set('serial', serial);
      const res = await fetch(url, { method: 'POST', body: fd });
      const text = await res.text();
      setOut(`HTTP ${res.status}\n${text}`);
    } catch (e) {
      setOut(`ERR: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="API Tester" sub="Test connect / encrypt against your panel. Game defaults to PUBG." />
      <Card>
        <CardBody>
          <div className="grid gap-3 md:grid-cols-3">
            <div><Label htmlFor="k">user_key</Label><Input id="k" value={key} onChange={(e) => setKey(e.target.value)} placeholder="paste key" className="font-mono" /></div>
            <div><Label htmlFor="s">serial / HWID</Label><Input id="s" value={serial} onChange={(e) => setSerial(e.target.value)} className="font-mono" /></div>
            <div>
              <Label htmlFor="ep">Endpoint</Label>
              <Select id="ep" value={endpoint} onChange={(e) => setEndpoint(e.target.value as 'connect' | 'encrypt')}>
                <option value="connect">CONNECT</option>
                <option value="encrypt">ENCRYPT</option>
              </Select>
            </div>
          </div>
          <p className="mt-2 break-all font-mono text-xs text-muted">POST {url || '(sign in to resolve panel)'}</p>
          <Button onClick={run} disabled={busy || !key || !panel} className="mt-3 w-full">{busy ? 'Sending…' : 'Send POST'}</Button>
        </CardBody>
      </Card>
      <Card className="mt-4">
        <CardBody>
          <h2 className="text-sm font-bold text-ink">Response</h2>
          <pre className="mt-2 min-h-[120px] overflow-x-auto whitespace-pre-wrap rounded-md2 bg-slate-900 p-4 font-mono text-xs text-slate-100">{out}</pre>
        </CardBody>
      </Card>
    </div>
  );
}
