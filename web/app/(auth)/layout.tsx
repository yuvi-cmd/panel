import { ShieldCheck } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const panelName = process.env.NEXT_PUBLIC_PANEL_NAME || 'ARC Auth';
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="w-full max-w-[420px]">
        <div className="mb-5 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-card">
            <ShieldCheck className="h-7 w-7" />
          </span>
          <h1 className="mt-2 text-lg font-bold text-ink">{panelName}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
