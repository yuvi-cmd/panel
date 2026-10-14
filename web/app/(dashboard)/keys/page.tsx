'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyButton } from '@/components/bits';
import { Badge, Button, ConfirmDialog, Input, Select, useToast } from '@/components/ui';
import { DataTable, PageHeader, StatusBadge, type Column } from '@/components/dashboard';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ApiKey } from '@/types';

const PAGE_SIZE = 20;

export default function KeysPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<ApiKey[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [server, setServer] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<{ action: string; id: number } | null>(null);
  const isOwnerLike = user?.role === 'OWNER' || user?.role === 'PROFESSOR';

  useEffect(() => {
    const t = window.setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.keys({ search: debounced || undefined, status, server, page, pageSize: PAGE_SIZE });
      setRows(r.items);
      setTotal(r.total);
      setSelected(new Set());
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not load keys.');
    } finally {
      setLoading(false);
    }
  }, [debounced, status, server, page, push]);

  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, okMsg: string) {
    try {
      const r = await api.keyAction(body);
      push('success', r.message || okMsg);
      await load();
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Action failed.');
    }
  }

  const toggle = (id: string | number) =>
    setSelected((s) => { const n = new Set(s); const k = Number(id); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleAll = () =>
    setSelected((s) => (rows.every((r) => s.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id))));

  const columns: Column<ApiKey>[] = useMemo(() => [
    {
      key: 'key', header: 'Key',
      render: (k) => (
        <span className="flex max-w-[280px] items-center gap-2">
          <code className="truncate font-mono text-[13px] font-semibold">{k.key_value}</code>
          <CopyButton text={k.key_value} />
        </span>
      ),
    },
    { key: 'plan', header: 'Plan', render: (k) => <span className="flex gap-1"><Badge>{k.duration}</Badge><Badge tone="indigo">{k.server_type}</Badge></span> },
    { key: 'devices', header: 'Devices', render: (k) => <span className="text-muted">{k.dev_count}/{k.device_limit} · {k.uses} uses</span> },
    { key: 'status', header: 'Status', render: (k) => <StatusBadge active={!k.is_blocked && !k.expired} blocked={!!k.is_blocked} expired={k.expired} /> },
    { key: 'expiry', header: 'Expires', render: (k) => <span className="whitespace-nowrap text-[13px] text-muted">{k.expires_at_ist || k.expires_at || `Pending (${k.duration})`}</span> },
    {
      key: 'actions', header: 'Actions',
      render: (k) => (
        <span className="flex flex-wrap gap-1.5">
          <Button variant="outline" className="px-2.5 py-1.5 text-xs" onClick={() => act({ action: 'reset_device', key_id: k.id }, 'Devices reset.')}>Reset</Button>
          <Button variant="outline" className="px-2.5 py-1.5 text-xs" onClick={() => act({ action: 'edit_key', key_id: k.id, edit_status: k.is_blocked ? '1' : '0' }, 'Key updated.')}>
            {k.is_blocked ? 'Unblock' : 'Block'}
          </Button>
          <Button variant="ghost" className="px-2.5 py-1.5 text-xs text-red-600" onClick={() => setConfirm({ action: 'delete_key', id: k.id })}>Delete</Button>
        </span>
      ),
    },
  ], []); // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Keys"
        sub={`${total} key${total === 1 ? '' : 's'} in your scope`}
        actions={<Link href="/generate"><Button>Generate</Button></Link>}
      />

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input placeholder="Search key or creator…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search keys" />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
          <option value="expired">Expired</option>
        </Select>
        <Select value={server} onChange={(e) => { setServer(e.target.value); setPage(1); }} aria-label="Filter by server">
          <option value="ALL">All servers</option>
          <option value="PRIVATE">Private</option>
          <option value="PUBLIC">Public</option>
          <option value="ADMIN">Admin</option>
          <option value="SAFE">Safe</option>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg2 border border-line bg-white px-4 py-2.5 text-sm shadow-card">
          <span className="font-semibold">{selected.size} selected</span>
          <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => { setSelected(new Set()); }}>Clear</Button>
          {isOwnerLike && (
            <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => push('error', 'Bulk delete is intentionally per-key. Select Delete on a row to confirm.')}>
              Bulk actions
            </Button>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyTitle="No keys found"
        emptyHint={debounced ? 'Try a different search.' : 'Generate your first key to get started.'}
        emptyAction={<Link href="/generate"><Button>Generate key</Button></Link>}
        selected={selected}
        onToggle={toggle}
        onToggleAll={toggleAll}
      />

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Page {page} of {pages}</span>
          <span className="flex gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </span>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete key?"
        message="This permanently deletes the key. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirm && act({ action: 'delete_key', key_id: confirm.id }, 'Key deleted.')}
      />
    </div>
  );
}
