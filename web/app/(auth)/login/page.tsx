'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Card, CardBody, Input, Label, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { deviceInfo } from '@/lib/utils';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { push } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (username.trim().length < 3) return setError('Username must be at least 3 characters.');
    if (password.length < 4) return setError('Password must be at least 4 characters.');
    setBusy(true);
    try {
      await api.login(username.trim(), password, await deviceInfo());
      push('success', 'Signed in.');
      router.replace(params.get('next') || '/dashboard');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Sign-in failed.';
      setError(msg);
      if (err instanceof ApiError && err.code === 'DEVICE_LOCKED') {
        push('error', 'Device locked. Use Reset device, then sign in again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {params.get('msg') && (
        <div className="mt-4 rounded-md2 border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-700" role="status">
          {params.get('msg')}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-md2 border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700" role="alert">
          {error}{' '}
          {error.toLowerCase().includes('another device') && (
            <Link href="/reset-device" className="underline">Reset device</Link>
          )}
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <div>
          <Label htmlFor="username">Username</Label>
          <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Hide password' : 'Show password'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted hover:text-ink"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <Card>
      <CardBody className="p-6">
        <h2 className="text-center text-base font-bold text-ink">Welcome back</h2>
        <p className="mt-0.5 text-center text-xs text-muted">Sign in to continue</p>
        <Suspense>
          <LoginForm />
        </Suspense>
        <p className="mt-4 text-center text-xs text-muted">
          New here? <Link href="/register" className="font-bold text-accent-dark">Create account</Link>
          {' · '}
          <Link href="/join-panel" className="font-bold text-accent-dark">Join panel</Link>
        </p>
      </CardBody>
    </Card>
  );
}
