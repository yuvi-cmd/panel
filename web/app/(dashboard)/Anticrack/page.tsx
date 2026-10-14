'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, CardBody, useToast } from '@/components/ui';
import { PageHeader, StatCard } from '@/components/dashboard';
import { api, ApiError } from '@/lib/api';

// Anticrack: only the anti-tamper features the backend actually supports:
// key→device binding with limits, panel-login device lock, and lib-signature
// hash posture (counts only — no hash values in the client).
export default function AnticrackPage() {
  const { push } = useToast();
  const [data, setData] = useState<{
    device_binding: { bound_devices: number; note: string };
    device_lock: { enabled: boolean; note: string };
    lib_hashes: Array<{ engine: string; total: number; active: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.anticrack()
      .then(setData)
      .catch((e) => push('error', e instanceof ApiError ? e.message : 'Could not load status.'))
      .finally(() => setLoading(false));
  }, [push]);

  return (
    <div>
      <PageHeader title="Anticrack" sub="Anti-tamper posture actually enforced by the backend." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Bound devices" value={data?.device_binding.bound_devices ?? '—'} sub="key→device bindings" loading={loading} />
        <StatCard label="Device lock" value={data ? (data.device_lock.enabled ? 'ON' : 'OFF') : '—'} sub="panel login binding" loading={loading} />
        <StatCard
          label="Active lib hashes"
          value={data ? data.lib_hashes.reduce((n, h) => n + h.active, 0) : '—'}
          sub={data ? data.lib_hashes.map((h) => `${h.engine}: ${h.active}/${h.total}`).join(' · ') || 'none configured' : ''}
          loading={loading}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Device binding <Badge tone="green" className="ml-1">Enforced</Badge></h2>
            <p className="mt-2 text-sm text-muted">{data?.device_binding.note || 'Loading…'}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Login device lock <Badge tone="green" className="ml-1">Enforced</Badge></h2>
            <p className="mt-2 text-sm text-muted">{data?.device_lock.note || 'Loading…'}</p>
          </CardBody>
        </Card>
      </div>
      <p className="mt-3 text-xs text-muted">Note: MUNDO (AES-128-ECB) and BCORE (RC4) transport crypto is legacy-compat and documented in SECURITY.md — it is not claimed as tamper-proof.</p>
    </div>
  );
}
