'use client';

import { useEffect, useState } from 'react';
import { Button, Card, CardBody, Input, Label, Switch, useToast } from '@/components/ui';
import { PageHeader } from '@/components/dashboard';
import { api, ApiError } from '@/lib/api';

const FEATURES = ['ESP', 'Item', 'AIM', 'SilentAim', 'BulletTrack', 'Floating', 'Memory', 'Setting'];

export default function ServerPage() {
  const { push } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [maintOn, setMaintOn] = useState(false);
  const [maintReason, setMaintReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.server()
      .then((r) => { setSettings(r.settings || {}); setMaintOn(r.maintenance.on); setMaintReason(r.maintenance.reason); })
      .catch((e) => push('error', e instanceof ApiError ? e.message : 'Could not load server config.'))
      .finally(() => setLoading(false));
  }, [push]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setSettings((s) => ({ ...s, [k]: e.target.value }));

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { maintenance_on: maintOn, maintenance_reason: maintReason };
      for (const k of ['modname', 'mod_status', 'credit', 'license_key', ...FEATURES]) body[k] = settings[k] ?? (FEATURES.includes(k) ? false : '');
      // Feature toggles: checkbox state lives in `feat` below; merge here.
      for (const f of FEATURES) body[f] = feat[f];
      const r = await api.saveServer(body);
      push('success', r.message || 'Server config saved.');
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  const [feat, setFeat] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const m: Record<string, boolean> = {};
    for (const f of FEATURES) m[f] = (settings[f] ?? 'on') === 'on';
    setFeat(m);
  }, [settings]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Server & Mod" />
        <Card><CardBody><p className="text-sm text-muted">Loading…</p></CardBody></Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Server & Mod" sub="Maintenance switch and mod configuration." />
      <form onSubmit={onSave} className="space-y-4">
        <Card>
          <CardBody>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-ink">Maintenance mode</h2>
                <p className="text-xs text-muted">{maintOn ? 'ON — clients are blocked.' : 'OFF — server is live.'}</p>
              </div>
              <Switch checked={maintOn} onCheckedChange={setMaintOn} label="Maintenance mode" />
            </div>
            <div className="mt-3">
              <Label htmlFor="reason">Maintenance reason (shown to clients)</Label>
              <Input id="reason" value={maintReason} onChange={(e) => setMaintReason(e.target.value)} placeholder="Server is under maintenance…" maxLength={255} />
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Mod identity</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div><Label htmlFor="modname">Mod name</Label><Input id="modname" value={settings.modname || ''} onChange={set('modname')} /></div>
              <div><Label htmlFor="mod_status">Mod status</Label><Input id="mod_status" value={settings.mod_status || ''} onChange={set('mod_status')} /></div>
              <div><Label htmlFor="credit">Credit</Label><Input id="credit" value={settings.credit || ''} onChange={set('credit')} /></div>
              <div><Label htmlFor="license_key">License key</Label><Input id="license_key" value={settings.license_key || ''} onChange={set('license_key')} className="font-mono" /></div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h2 className="text-sm font-bold text-ink">Feature switches</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              {FEATURES.map((f) => (
                <label key={f} className="flex cursor-pointer items-center gap-2 rounded-md2 border border-line px-3 py-2.5 text-sm font-semibold">
                  <input type="checkbox" checked={!!feat[f]} onChange={(e) => setFeat((m) => ({ ...m, [f]: e.target.checked }))} className="h-4 w-4 accent-[#4F46E5]" />
                  {f}
                </label>
              ))}
            </div>
            <Button type="submit" disabled={saving} className="mt-4 w-full">{saving ? 'Saving…' : 'Save server config'}</Button>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
