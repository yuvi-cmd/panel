'use client';

import { useState } from 'react';
import { Button, Card, CardBody, Input, Label, useToast } from '@/components/ui';
import { PageHeader } from '@/components/dashboard';
import { api, ApiError, apiBase } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Settings: account + preferences supported by the backend (password change;
// branding/theme stay on the Worker /settings route for owners).
export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { push } = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 4) {
      push('error', 'New password must be at least 4 characters.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.changePassword(cur, next);
      push('success', r.message || 'Password updated.');
      setCur('');
      setNext('');
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" sub="Account and preferences." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Change password</h2>
            <form onSubmit={change} className="mt-3 space-y-3">
              <div><Label htmlFor="cp">Current password</Label><Input id="cp" type="password" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" /></div>
              <div><Label htmlFor="np">New password (min 4)</Label><Input id="np" type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" /></div>
              <Button type="submit" disabled={busy} className="w-full">{busy ? 'Updating…' : 'Update password'}</Button>
            </form>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Panel</h2>
            <p className="mt-2 text-sm text-muted">Signed in as <span className="font-semibold text-ink">{user?.username}</span> ({user?.role}) on <span className="font-mono">{user?.panel_code}</span>.</p>
            <p className="mt-1 text-sm text-muted">Worker: <span className="font-mono text-xs">{apiBase()}</span></p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`${apiBase()}/settings`} target="_blank" rel="noreferrer"><Button variant="outline">Branding & theme (Worker)</Button></a>
              <Button variant="ghost" className="text-red-600" onClick={() => logout()}>Sign out</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
