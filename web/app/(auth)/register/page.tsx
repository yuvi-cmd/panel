'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, CardBody, Input, Label } from '@/components/ui';
import { BASE } from '@/lib/site';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ full_name: '', username: '', password: '', referral_code: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Registration uses the Worker's form endpoint (referral model unchanged).
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.full_name.trim()) return setError('Full name is required.');
    if (form.username.trim().length < 3) return setError('Username must be at least 3 characters.');
    if (form.password.length < 4) return setError('Password must be at least 4 characters.');
    if (!form.referral_code.trim()) return setError('Referral code is required.');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('full_name', form.full_name.trim());
      fd.set('username', form.username.trim());
      fd.set('password', form.password);
      fd.set('referral_code', form.referral_code.trim());
      const res = await fetch(`${BASE}/register`, { method: 'POST', body: fd, redirect: 'manual', credentials: 'include' });
      if (res.status === 302 || res.ok) {
        router.replace('/login?msg=' + encodeURIComponent('Account created! Please sign in.'));
        return;
      }
      setError('Registration failed. Check your referral code.');
    } catch {
      setError('Backend unreachable. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="p-6">
        <h2 className="text-center text-base font-bold text-ink">Create account</h2>
        <p className="mt-0.5 text-center text-xs text-muted">Referral code required</p>
        {error && <div className="mt-4 rounded-md2 border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700" role="alert">{error}</div>}
        <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
          <div><Label htmlFor="fn">Full name</Label><Input id="fn" value={form.full_name} onChange={set('full_name')} placeholder="Your name" required /></div>
          <div><Label htmlFor="un">Username</Label><Input id="un" value={form.username} onChange={set('username')} placeholder="Choose a username" required /></div>
          <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" value={form.password} onChange={set('password')} placeholder="Min 4 characters" required /></div>
          <div><Label htmlFor="rc">Referral code</Label><Input id="rc" value={form.referral_code} onChange={set('referral_code')} placeholder="REF-XXXXXXXX" className="font-mono" required /></div>
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating…' : 'Create account'}</Button>
        </form>
        <p className="mt-4 text-center text-xs"><Link href="/login" className="font-bold text-accent-dark">Back to sign in</Link></p>
      </CardBody>
    </Card>
  );
}
