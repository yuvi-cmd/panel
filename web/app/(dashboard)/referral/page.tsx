'use client';

import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/bits';
import { Badge, Button, Card, CardBody, Input, Label, useToast } from '@/components/ui';
import { PageHeader } from '@/components/dashboard';
import { api, ApiError, apiBase } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function ReferralPage() {
  const { push } = useToast();
  const [items, setItems] = useState<Array<{ code: string; role: string; duration: number; balance: number; used: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('RESELLER');
  const [days, setDays] = useState(30);
  const [balance, setBalance] = useState(0);
  const { user } = useAuth();
  const isOwnerLike = user?.role === 'OWNER' || user?.role === 'PROFESSOR';

  async function load() {
    setLoading(true);
    try {
      const r = await api.referrals();
      setItems(r.items as typeof items);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not load referrals.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api.referralAction({ action: 'generate', role, duration: days, balance });
      push('success', `Referral generated: ${r.code}`);
      await load();
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Generation failed.');
    }
  }

  async function remove(code: string) {
    if (!window.confirm('Delete referral?')) return;
    try {
      await api.referralAction({ action: 'delete_ref', del_code: code });
      await load();
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Delete failed.');
    }
  }

  return (
    <div>
      <PageHeader title="Referrals" sub={`${items.length} codes`} />
      <Card>
        <CardBody>
          <form onSubmit={generate} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <Label htmlFor="rr">Role</Label>
              <select id="rr" value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-md2 border border-line bg-white px-3 py-2.5 text-sm font-semibold">
                {isOwnerLike && <option value="ADMIN">ADMIN</option>}
                <option value="RESELLER">RESELLER</option>
              </select>
            </div>
            <div><Label htmlFor="rd">Days</Label><Input id="rd" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} /></div>
            <div><Label htmlFor="rb">Balance Rs</Label><Input id="rb" type="number" min={0} value={balance} onChange={(e) => setBalance(Number(e.target.value) || 0)} /></div>
            <div className="flex items-end"><Button type="submit" className="w-full">Generate</Button></div>
          </form>
        </CardBody>
      </Card>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {loading && <p className="text-sm text-muted">Loading…</p>}
        {!loading && items.length === 0 && (
          <Card><CardBody><p className="text-center text-sm text-muted">No referrals yet.</p></CardBody></Card>
        )}
        {items.map((r) => (
          <Card key={r.code}>
            <CardBody>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all font-mono text-sm font-bold">{r.code}</code>
                <CopyButton text={r.code} />
                <Button variant="ghost" className="px-2 py-1 text-xs text-red-600" onClick={() => remove(r.code)}>Delete</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="indigo">{r.role}</Badge>
                <Badge tone="purple">{r.duration} days</Badge>
                <Badge tone="amber">Rs {r.balance}</Badge>
                {r.used ? <Badge tone="red">Used</Badge> : <Badge tone="green">Fresh</Badge>}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Worker base: <span className="font-mono">{apiBase()}</span></p>
    </div>
  );
}
