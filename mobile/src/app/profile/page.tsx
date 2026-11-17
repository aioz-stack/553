'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Field, Notice, Panel, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Profile() {
  const { user, refresh, logout } = useAuth();
  const [form, setForm] = useState({ name: '', display_name: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setForm({ name: user.name, display_name: user.display_name ?? '' });
    }
  }, [user]);

  const save = async () => {
    try {
      await api('/profile', { method: 'PATCH', body: form });
      await refresh();
      setMessage({ tone: 'success', text: 'Profile saved.' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
    }
  };

  return (
    <Screen title="Profile">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <Panel>
        <p className="text-lg font-semibold text-gray-900 dark:text-white">@{user?.username}</p>
        <p className="text-sm text-gray-500">{user?.email} · {user?.role_label}</p>
      </Panel>
      <Panel title="Edit profile">
        <Field label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label="Display name at tables" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        <Button className="w-full" onClick={save}>Save</Button>
      </Panel>
      <Panel>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/history/"><Button variant="outline" className="w-full">History</Button></Link>
          <Link href="/settings/"><Button variant="outline" className="w-full">Settings</Button></Link>
        </div>
        <Button variant="danger" className="mt-3 w-full" onClick={logout}>Sign out</Button>
      </Panel>
    </Screen>
  );
}
