'use client';

// Authenticated dashboard shell: white sidebar + header, near-white content,
// role-aware nav, active state, mobile drawer (Sheet), user menu + logout.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Bell,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Server,
  Settings,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  TicketCheck,
  Users,
  UserPlus,
  Boxes,
  X,
} from 'lucide-react';
import { DropdownMenu, Sheet } from '@/components/ui';
import { useAuth, roleRank } from '@/lib/auth';
import { cx } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  minRank: number; // PROFESSOR=4 OWNER=3 ADMIN=2 RESELLER=1; 0 = everyone logged in
  section?: string;
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, minRank: 0 },
  { href: '/generate', label: 'Generate', icon: <Sparkles className="h-4 w-4" />, minRank: 0 },
  { href: '/keys', label: 'Keys', icon: <KeyRound className="h-4 w-4" />, minRank: 0 },
  { href: '/users', label: 'Users', icon: <Users className="h-4 w-4" />, minRank: 2, section: 'Manage' },
  { href: '/referral', label: 'Referrals', icon: <UserPlus className="h-4 w-4" />, minRank: 2 },
  { href: '/server', label: 'Server & Mod', icon: <Server className="h-4 w-4" />, minRank: 2, section: 'System' },
  { href: '/api-test', label: 'API Tester', icon: <FlaskConical className="h-4 w-4" />, minRank: 2 },
  { href: '/enc-api', label: 'Encryption', icon: <ShieldCheck className="h-4 w-4" />, minRank: 3 },
  { href: '/Anticrack', label: 'Anticrack', icon: <ShieldHalf className="h-4 w-4" />, minRank: 2 },
  { href: '/panel-activate', label: 'Activate Panel', icon: <TicketCheck className="h-4 w-4" />, minRank: 0 },
  { href: '/tenant', label: 'Tenants', icon: <Boxes className="h-4 w-4" />, minRank: 4, section: 'Admin' },
  { href: '/settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, minRank: 0 },
];

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const rank = roleRank(user?.role);
  const panelName = process.env.NEXT_PUBLIC_PANEL_NAME || 'ARC Auth';
  let lastSection = '';
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-line px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg2 bg-accent text-white">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">{panelName}</p>
          <p className="truncate font-mono text-[11px] text-muted">{user?.panel_code || ''}</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Primary">
        {NAV.filter((n) => rank >= n.minRank).map((n) => {
          const active = pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href));
          const sectionHead = n.section && n.section !== lastSection ? ((lastSection = n.section), true) : false;
          return (
            <div key={n.href}>
              {sectionHead && <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-muted">{n.section}</p>}
              <Link
                href={n.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'mb-0.5 flex items-center gap-3 rounded-md2 px-3 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-accent-light text-accent-dark' : 'text-slate-600 hover:bg-slate-100 hover:text-ink',
                )}
              >
                {n.icon}
                {n.label}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-line p-4 text-[11px] text-muted">
        <p className="font-mono">Tenant: {user?.panel_code}</p>
        <p className="mt-0.5">Role: {user?.role}</p>
      </div>
    </div>
  );
}

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/generate': 'Generate Keys',
  '/keys': 'Keys',
  '/users': 'Users',
  '/referral': 'Referrals',
  '/server': 'Server & Mod',
  '/api-test': 'API Tester',
  '/enc-api': 'Encryption',
  '/Anticrack': 'Anticrack',
  '/panel-activate': 'Activate Panel',
  '/tenant': 'Tenants',
  '/settings': 'Settings',
  '/profile': 'Profile',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 border-r border-line bg-white md:block" />
        <div className="flex-1 p-8">
          <div className="h-8 w-48 animate-pulse rounded-md bg-slate-200" />
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg2 border border-line bg-white" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const title = TITLES[pathname] || TITLES['/' + pathname.split('/')[1]] || 'ARC Auth';
  const initial = (user.username || 'U').slice(0, 1).toUpperCase();

  return (
    <div className="flex min-h-screen bg-page">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-white md:block">
        <SidebarBody />
      </aside>
      <Sheet open={drawer} onClose={() => setDrawer(false)}>
        <div className="flex h-full flex-col">
          <div className="flex justify-end p-2">
            <button onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded-md p-2 text-muted hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <SidebarBody onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-white px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-md2 border border-line p-2 text-muted hover:bg-slate-50 md:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-ink md:text-lg">{title}</h1>
              <p className="hidden truncate text-xs text-muted sm:block">ARC Auth / {title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button aria-label="Notifications" title="Notifications" className="rounded-md2 border border-line p-2 text-muted hover:bg-slate-50">
              <Bell className="h-4 w-4" />
            </button>
            <DropdownMenu
              trigger={
                <button className="flex items-center gap-2 rounded-md2 border border-line py-1.5 pl-1.5 pr-3 hover:bg-slate-50" aria-label="User menu">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent font-bold text-white">{initial}</span>
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-[120px] truncate text-sm font-semibold text-ink">{user.username}</span>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-accent-dark">{user.role}</span>
                  </span>
                </button>
              }
              items={[
                { label: 'Profile', href: '/profile' },
                { label: 'Settings', href: '/settings' },
                {
                  label: 'Sign out',
                  danger: true,
                  onClick: () => logout(),
                },
              ]}
            />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
