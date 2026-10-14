'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardBody, Input, Label, useToast } from '@/components/ui';
import { DataTable, PageHeader, type Column } from '@/components/dashboard';
import { api, ApiError } from '@/lib/api';
import type { Panel } from '@/types';

// Tenant management: panel creation with name/duration. Super-admin
// (first user) and Professor only — the API enforces this too.
export default function TenantPage() {
  const { push } = useToast();
  const [items, setItems] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await api.panels();
      setItems(r.items);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not load tenants.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.panelAction({ action: 'create', custom_code: code.trim().toUpperCase() || undefined, duration: days });
      push('success', `Panel ${r.panel_code} created.`);
      setCode('');
      await load();
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Create failed.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(panel_code: string) {
    try {
      await api.panelAction({ action: 'toggle_status', target_panel: panel_code });
      await load();
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Update failed.');
    }
  }

  const columns: Column<Panel>[] = [
    { key: 'code', header: 'Panel', render: (p) => <code className="font-mono font-bold">{p.panel_code}</code> },
    { key: 'status', header: 'Status', render: (p) => (p.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Off</Badge>) },
    { key: 'counts', header: 'Users / Keys', render: (p) => <span className="text-muted">{p.total_users ?? 0} / {p.total_keys ?? 0}</span> },
    {
      key: 'act', header: 'Actions',
      render: (p) => <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => toggle(p.panel_code)}>Toggle ON/OFF</Button>,
    },
  ];

  return (
    <div>
      <PageHeader title="Tenants" sub={`${items.length} panels`} />
      <Card>
        <CardBody>
          <form onSubmit={create} className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div><Label htmlFor="tc">Panel code (blank = auto)</Label><Input id="tc" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CODE (A-Z 0-9 _)" maxLength={15} className="font-mono" /></div>
            <div><Label htmlFor="td">Duration (days)</Label><Input id="td" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Number(e.target.value) || 30)} /></div>
            <div className="flex items-end"><Button type="submit" disabled={busy} className="w-full">{busy ? 'Creating…' : 'Create panel'}</Button></div>
          </form>
        </CardBody>
      </Card>
      <div className="mt-4">
        <DataTable columns={columns} rows={items.map((p) => ({ ...p, id: p.panel_code }))} loading={loading} emptyTitle="No panels" />
      </div>
    </div>
  );
}
