'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, ConfirmDialog, Input, useToast } from '@/components/ui';
import { DataTable, PageHeader, type Column } from '@/components/dashboard';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { ManagedUser } from '@/types';

export default function UsersPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState<ManagedUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.users();
      setRows(r.items);
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  }, [push]);

  useEffect(() => { load(); }, [load]);

  async function act(body: Record<string, unknown>, okMsg: string) {
    try {
      const r = await api.userAction(body);
      push('success', r.message || okMsg);
      await load();
    } catch (e) {
      push('error', e instanceof ApiError ? e.message : 'Action failed.');
    }
  }

  const columns: Column<ManagedUser>[] = [
    {
      key: 'user', header: 'User',
      render: (u) => (
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent font-bold text-white">
            {(u.username || 'U').slice(0, 1).toUpperCase()}
          </span>
          <span>
            <span className="block font-semibold text-ink">{u.username}</span>
            <span className="block text-xs text-muted">{u.invited ? `invited by ${u.invited}` : ''}</span>
          </span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => <Badge tone={u.role === 'OWNER' ? 'purple' : u.role === 'ADMIN' ? 'indigo' : 'slate'}>{u.role}</Badge> },
    { key: 'status', header: 'Status', render: (u) => (u.is_blocked ? <Badge tone="red">Blocked</Badge> : <Badge tone="green">Active</Badge>) },
    { key: 'balance', header: 'Balance', render: (u) => <span className="font-semibold">Rs {u.balance}</span> },
    {
      key: 'actions', header: 'Actions',
      render: (u) => {
        const self = user && u.id === user.id;
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <Input
              aria-label={`Amount for ${u.username}`}
              type="number"
              min={0}
              placeholder="Amt"
              value={amounts[u.id] || ''}
              onChange={(e) => setAmounts((m) => ({ ...m, [u.id]: e.target.value }))}
              className="w-20 px-2 py-1.5 text-xs"
            />
            <Button variant="outline" className="px-2.5 py-1.5 text-xs" onClick={() => act({ action: 'add_balance', target_id: u.id, amount: Number(amounts[u.id] || 0) }, 'Balance updated.')}>+ Bal</Button>
            <Button variant="outline" className="px-2.5 py-1.5 text-xs" onClick={() => act({ action: 'deduct_balance', target_id: u.id, amount: Number(amounts[u.id] || 0) }, 'Balance updated.')}>− Bal</Button>
            {!self && (
              <Button variant="ghost" className="px-2.5 py-1.5 text-xs text-red-600" onClick={() => setConfirm(u)}>
                {u.is_blocked ? 'Unblock' : 'Block'}
              </Button>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader title="Users" sub={`${rows.length} users in your scope`} />
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        emptyTitle="No users"
        emptyHint="Users appear here when they register with a referral code."
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.is_blocked ? 'Unblock user?' : 'Block user?'}
        message={confirm ? `This will ${confirm.is_blocked ? 'unblock' : 'block'} ${confirm.username}.` : ''}
        confirmLabel={confirm?.is_blocked ? 'Unblock' : 'Block'}
        onConfirm={() => confirm && act({ action: 'toggle_block', target_id: confirm.id }, 'Block status updated.')}
      />
    </div>
  );
}
