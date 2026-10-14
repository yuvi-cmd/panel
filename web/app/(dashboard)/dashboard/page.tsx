'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { KeyRound, Server, Users, Wallet } from 'lucide-react';
import { Button, Card, CardBody } from '@/components/ui';
import { PageHeader, StatCard } from '@/components/dashboard';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { DashboardStats } from '@/types';

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({});
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiOk, setApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [d, h] = await Promise.allSettled([api.dashboard(), api.health()]);
        if (d.status === 'fulfilled') {
          setStats(d.value.stats);
          setBalance(d.value.balance);
        } else {
          setError(d.reason instanceof ApiError ? d.reason.message : 'Could not load dashboard.');
        }
        setApiOk(h.status === 'fulfilled');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const s = (k: string) => Number(stats[k] || 0);
  const role = user?.role || 'RESELLER';
  const isOwnerLike = role === 'OWNER' || role === 'PROFESSOR';

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${user?.username || ''}`}
        sub={role === 'OWNER' ? 'Manage your entire panel network.' : role === 'ADMIN' ? 'Manage your team and keys.' : 'Track your keys and account.'}
        actions={
          <>
            <Link href="/generate"><Button>Generate key</Button></Link>
            <Link href="/keys"><Button variant="outline">View keys</Button></Link>
          </>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg2 border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </div>
      )}

      {isOwnerLike ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Account balance" value="UNLIMITED" icon={<Wallet className="h-5 w-5" />} loading={loading} />
          <StatCard label="Total panel keys" value={s('total_keys')} sub={`${s('active_keys')} active`} icon={<KeyRound className="h-5 w-5" />} loading={loading} />
          <StatCard label="Admins / Resellers" value={`${s('total_admins')} / ${s('total_resellers')}`} icon={<Users className="h-5 w-5" />} loading={loading} />
        </div>
      ) : role === 'ADMIN' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Balance" value={balance ?? '—'} icon={<Wallet className="h-5 w-5" />} loading={loading} />
          <StatCard label="Team keys" value={s('team_keys')} icon={<KeyRound className="h-5 w-5" />} loading={loading} />
          <StatCard label="My keys" value={s('my_keys')} sub={`${s('my_active_keys')} active`} icon={<KeyRound className="h-5 w-5" />} loading={loading} />
          <StatCard label="My resellers" value={s('my_resellers')} icon={<Users className="h-5 w-5" />} loading={loading} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Balance" value={balance ?? '—'} icon={<Wallet className="h-5 w-5" />} loading={loading} />
          <StatCard label="Total keys" value={s('my_keys')} icon={<KeyRound className="h-5 w-5" />} loading={loading} />
          <StatCard label="Active keys" value={s('my_active_keys')} icon={<KeyRound className="h-5 w-5" />} loading={loading} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Server className="h-4 w-4 text-accent-dark" /> API / server status</h2>
            {loading ? (
              <p className="mt-2 text-sm text-muted">Checking…</p>
            ) : apiOk ? (
              <p className="mt-2 text-sm text-emerald-700">Backend reachable. Key APIs and client endpoints are up.</p>
            ) : (
              <p className="mt-2 text-sm text-red-600">Backend unreachable. Check NEXT_PUBLIC_API_BASE and Worker deployment.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Quick actions</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/generate"><Button variant="secondary">Generate</Button></Link>
              <Link href="/keys"><Button variant="outline">Manage keys</Button></Link>
              <Link href="/api-test"><Button variant="outline">Test API</Button></Link>
              {(role === 'OWNER' || role === 'ADMIN' || role === 'PROFESSOR') && (
                <Link href="/server"><Button variant="outline">Server config</Button></Link>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
