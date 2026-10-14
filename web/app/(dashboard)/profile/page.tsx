'use client';

import { Card, CardBody } from '@/components/ui';
import { PageHeader, StatCard } from '@/components/dashboard';
import { useAuth } from '@/lib/auth';

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader title="Profile" sub="Your account." />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Username" value={user?.username || '—'} />
        <StatCard label="Role" value={user?.role || '—'} />
        <StatCard label="Panel" value={user?.panel_code || '—'} />
      </div>
      <Card className="mt-4 max-w-xl">
        <CardBody>
          <p className="text-sm text-muted">Full name: <span className="font-semibold text-ink">{user?.full_name || '—'}</span></p>
          <p className="mt-1 text-sm text-muted">Balance: <span className="font-semibold text-ink">{user?.unlimited ? 'UNLIMITED' : `Rs ${user?.balance ?? 0}`}</span></p>
        </CardBody>
      </Card>
    </div>
  );
}
