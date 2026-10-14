'use client';

// Reusable dashboard building blocks: PageHeader, StatCard, StatusBadge,
// DataTable (lightweight), EmptyState. Used across all dashboard pages.

import { Inbox } from 'lucide-react';
import { Badge, Card, Skeleton } from '@/components/ui';
import { cx } from '@/lib/utils';

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon, loading }: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode; loading?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-24" />
          ) : (
            <p className="mt-1 truncate text-3xl font-bold text-ink">{value}</p>
          )}
          {sub && <p className="mt-1 text-xs font-medium text-muted">{sub}</p>}
        </div>
        {icon && <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg2 bg-accent-light text-accent-dark">{icon}</div>}
      </div>
    </Card>
  );
}

export function StatusBadge({ active, blocked, expired }: { active?: boolean; blocked?: boolean; expired?: boolean }) {
  if (blocked) return <Badge tone="red">Blocked</Badge>;
  if (expired) return <Badge tone="amber">Expired</Badge>;
  if (active) return <Badge tone="green">Active</Badge>;
  return <Badge>Unknown</Badge>;
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string | number }>({
  columns,
  rows,
  loading,
  emptyTitle = 'No records',
  emptyHint,
  emptyAction,
  selected,
  onToggle,
  onToggleAll,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  selected?: Set<string | number>;
  onToggle?: (id: string | number) => void;
  onToggleAll?: () => void;
}) {
  if (loading) {
    return (
      <Card>
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }
  if (!rows.length) {
    return <EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} />;
  }
  const allChecked = selected && rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50/60 text-xs uppercase tracking-wide text-muted">
              {onToggleAll && (
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={!!allChecked} onChange={onToggleAll} aria-label="Select all" className="h-4 w-4 accent-[#4F46E5]" />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={cx('px-4 py-3 font-semibold', c.className)}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0 hover:bg-slate-50/50">
                {onToggle && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected?.has(row.id) || false}
                      onChange={() => onToggle(row.id)}
                      aria-label={`Select row ${row.id}`}
                      className="h-4 w-4 accent-[#4F46E5]"
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={cx('px-4 py-3 align-middle', c.className)}>{c.render(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-muted">
        <Inbox className="h-6 w-6" />
      </span>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
