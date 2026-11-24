import { useState, type FormEvent } from 'react';
import { Btn, I, Panel, Toast, fieldClass } from '../../Components/AdminPanel/kit';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api, errorMessage, fieldErrors } from '../../lib/api';

/**
 * Admin Panel → Change Password. The server checks the current password, requires 8+
 * characters with letters and numbers, a matching confirmation and a different password,
 * and stores it hashed.
 */
export default function ChangePassword() {
  const [form, setForm] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (form.password !== form.password_confirmation) {
      setErrors({ password: 'The new password and confirmation do not match.' });
      return;
    }
    setBusy(true);
    try {
      await api.put('/profile/password', form);
      setForm({ current_password: '', password: '', password_confirmation: '' });
      setToast({ ok: true, text: 'Your password has been changed.' });
    } catch (err) {
      setErrors(fieldErrors(err));
      setToast({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: keyof typeof form, label: string, autoComplete: string) => (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-[#3b3354] dark:text-white/80">{label}</span>
      <input type={show ? 'text' : 'password'} required autoComplete={autoComplete} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={fieldClass} aria-label={label} />
      {errors[key] && <span role="alert" className="mt-1 block text-sm font-semibold text-rose-600 dark:text-rose-400">{errors[key]}</span>}
    </label>
  );

  return (
    <AdminPanelLayout title="Change Password" subtitle="Keep your account secure">
      <Panel title="Change Password" icon={<I.lock className="h-6 w-6" />} className="max-w-xl">
        <form onSubmit={submit} className="space-y-4 px-5 py-5">
          {field('current_password', 'Current Password', 'current-password')}
          {field('password', 'New Password', 'new-password')}
          {field('password_confirmation', 'Confirm Password', 'new-password')}
          <p className="text-xs text-[#857d9c] dark:text-white/45">At least 8 characters with letters and numbers, different from your current password.</p>
          <label className="flex items-center gap-2 text-sm text-[#5b5274] dark:text-white/65">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
          </label>
          <Btn type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change Password'}</Btn>
        </form>
      </Panel>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}
