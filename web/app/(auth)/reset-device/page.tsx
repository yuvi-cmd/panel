'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, CardBody, Input, Label } from '@/components/ui';
import { BASE } from '@/lib/site';

// Device reset uses the Worker's form endpoint (24h cooldown enforced there).
export default function ResetDevicePage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('username', username.trim());
      fd.set('password', password);
      const res = await fetch(`${BASE}/reset-device`, { method: 'POST', body: fd, redirect: 'manual', credentials: 'include' });
      if (res.status === 302 || res.ok) {
        router.replace('/login?msg=' + encodeURIComponent('Device reset! Sign in on your new device.'));
        return;
      }
      setError('Reset failed (wrong credentials, or already reset within 24h).');
    } catch {
      setError('Backend unreachable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardBody className="p-6">
        <h2 className="text-center text-base font-bold text-ink">Reset device</h2>
        <p className="mt-0.5 text-center text-xs text-muted">Sign in on a new device afterwards</p>
        {error && <div className="mt-4 rounded-md2 border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700" role="alert">{error}</div>}
        <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
          <div><Label htmlFor="un">Username</Label><Input id="un" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
          <div><Label htmlFor="pw">Password</Label><Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <Button type="submit" disabled={busy} className="w-full">{busy ? 'Resetting…' : 'Reset device'}</Button>
        </form>
        <p className="mt-4 text-center text-xs"><Link href="/login" className="font-bold text-accent-dark">Back to sign in</Link></p>
      </CardBody>
    </Card>
  );
}
