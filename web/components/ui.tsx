'use client';

// Minimal shadcn-style primitives (Tailwind only, no extra runtime deps).
// Palette: white surfaces, #F8FAFC page bg, #E5E7EB borders, #4F46E5 accent,
// #18181B text, #64748B muted. Radius 8–12px, restrained shadows.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';
import { cx } from '@/lib/utils';

// ---------- Button ----------
type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-accent text-white hover:bg-accent-dark disabled:opacity-60',
    secondary: 'bg-accent-light text-accent-dark hover:bg-indigo-100 disabled:opacity-60',
    outline: 'border border-line bg-white text-ink hover:bg-slate-50 disabled:opacity-60',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-60',
    ghost: 'text-muted hover:bg-slate-100 hover:text-ink disabled:opacity-60',
  };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg2 px-4 py-2.5 text-sm font-semibold shadow-card transition-colors focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---------- Card ----------
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-lg2 border border-line bg-white shadow-card', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('border-b border-line px-5 py-4', className)} {...props} />;
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('px-5 py-4', className)} {...props} />;
}

// ---------- Input / Label / Select ----------
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx('mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted', className)} {...props} />;
}
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'w-full rounded-md2 border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:bg-slate-50',
        className,
      )}
      {...props}
    />
  );
}
export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'w-full rounded-md2 border border-line bg-white px-3.5 py-2.5 text-sm font-medium text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
        className,
      )}
      {...props}
    />
  );
}

// ---------- Badge ----------
export function Badge({ tone = 'slate', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'slate' | 'green' | 'red' | 'amber' | 'indigo' | 'purple' }) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    purple: 'bg-purple-50 text-purple-700',
  };
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', tones[tone], className)} {...props} />
  );
}

// ---------- Skeleton ----------
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-slate-200/80', className)} />;
}

// ---------- Switch ----------
export function Switch({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || 'toggle'}
      onClick={() => onCheckedChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-slate-300')}
    >
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

// ---------- Tabs ----------
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg2 border border-line bg-white p-1 shadow-card" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx(
            'rounded-md2 px-4 py-2 text-sm font-semibold transition-colors',
            value === t.value ? 'bg-accent text-white shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Dialog (modal) + ConfirmDialog ----------
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-lg2 border border-line bg-white p-6 shadow-pop">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        <div className="mt-3 text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p>{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

// ---------- DropdownMenu (simple, accessible) ----------
export function DropdownMenu({ trigger, items }: { trigger: React.ReactNode; items: Array<{ label: string; onClick?: () => void; href?: string; danger?: boolean }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open ]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-lg2 border border-line bg-white py-1 shadow-pop">
          {items.map((it, i) =>
            it.href ? (
              <a key={i} href={it.href} onClick={() => setOpen(false)} className={cx('block px-4 py-2 text-sm hover:bg-slate-50', it.danger ? 'text-red-600' : 'text-ink')}>
                {it.label}
              </a>
            ) : (
              <button key={i} onClick={() => { setOpen(false); it.onClick?.(); }} className={cx('block w-full px-4 py-2 text-left text-sm hover:bg-slate-50', it.danger ? 'text-red-600' : 'text-ink')}>
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Sheet (mobile drawer) ----------
export function Sheet({ open, onClose, children, side = 'left' }: { open: boolean; onClose: () => void; children: React.ReactNode; side?: 'left' | 'right' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className={cx('absolute inset-y-0 w-72 bg-white shadow-pop', side === 'left' ? 'left-0' : 'right-0')}>{children}</div>
    </div>
  );
}

// ---------- Toast (Sonner-style, dependency-free) ----------
interface Toast { id: number; kind: 'success' | 'error'; text: string }
const ToastCtx = createContext<{ push: (kind: Toast['kind'], text: string) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="flex items-start gap-2 rounded-lg2 border border-line bg-white px-4 py-3 shadow-pop">
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
            <p className="flex-1 text-sm font-medium text-ink">{t.text}</p>
            <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss" className="text-muted hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
