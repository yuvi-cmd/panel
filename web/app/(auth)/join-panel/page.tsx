'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, CardBody, Input, Label } from '@/components/ui';
import { BASE } from '@/lib/site';

export default function JoinPanelPage() {
  const router = useRouter();
  const [form, setForm] = useState({ panel_code: '', username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = k === 'panel_code' ? e.target.value.toUpperCase() : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.panel_code.trim()) return setError('Panel code is required.');
    if (form.username.trim().length < 3) return setError('Username must be at least 3 characters.');
    if (form.password.length < 4) return setError('Password must be at least 4 characters.');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('panel_code', form.panel_code.trim().toUpperCase());
      fd.set('username', form.username.trim());
      fd.set('password', form.password);
      const res = await fetch(`${BASE}/join-panel`, { method: 'POST', body: fd, redirect: 'manual', credentials: 'include' });
      if (res.status === 302 || res.ok) {
        router.replace('/login?msg=' + encodeURIComponent('Panel claimed! Please sign in.'));
        return;
      }
      setError('Could not claim panel. It may already have an owner.');
    } catch {
      setError('Backend unreachable. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="p-6">
        <h2 className="text-center text-base font-bold text-ink">Join panel</h2>
        <p className="mt-0.5 text-center text-xs text-muted">Claim an empty panel as owner</p>
        {error && <div className="mt-4 rounded-md2 border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700" role="alert">{error}</div>}
        <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
          <div><Label htmlFor="pc">Panel code</Label><Input id="pc" value={form.panel_code} onChange={set('panel_code')} placeholder="YUVI_001" className="font-mono" required /></div>
          <div><Label htmlFor="un">Username</Label><Input id="un" value={form.username} onChange={set('username')} required /></div>
          <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" value={form.password} onChange={set('password')} required /></div>
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Claiming…' : 'Join as owner'}</Button>
        </form>
        <p className="mt-4 text-center text-xs"><Link href="/login" className="font-bold text-accent-dark">Back to sign in</Link></p>
      </CardBody>
    </Card>
  );
}
