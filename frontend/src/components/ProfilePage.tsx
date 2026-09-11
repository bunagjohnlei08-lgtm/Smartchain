import React, { useEffect, useRef, useState } from 'react';
import { Building2, Camera, CheckCircle2, GitBranch, IdCard, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, Trash2, UserRound, Warehouse } from 'lucide-react';
import { apiClient } from '../lib/api';
import { type AuthUser, updateStoredUser } from '../lib/authUser';
import UserAvatar from './UserAvatar';

interface ProfilePageProps { breadcrumbLabel: string; }
type FieldErrors = Record<string, string>;

const inputClass = 'mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-[#0d1322] dark:text-slate-100 dark:placeholder:text-slate-500';
const readOnlyClass = `${inputClass} bg-slate-100 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400`;

const validationErrors = (cause: unknown, fallback: string): FieldErrors => {
  const error = cause as { response?: { status?: number; data?: { errors?: Record<string, string[]>; message?: string } } };
  const fields = error.response?.data?.errors;
  if (fields) return Object.fromEntries(Object.entries(fields).map(([key, messages]) => [key, String(messages[0] || fallback)]));
  if (error.response?.status === 401) return { form: 'Your session has expired. Please sign in again.' };
  if (error.response?.status === 403) return { form: 'You are not allowed to perform this action.' };
  return { form: fallback };
};

const FieldError = ({ message }: { message?: string }) => message ? <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{message}</p> : null;

const ReadOnlyField: React.FC<{ label: string; value: string; className?: string }> = ({ label, value, className = '' }) => <label className={`text-sm font-medium text-slate-700 dark:text-slate-300 ${className}`}>
  <span className="flex items-center justify-between gap-2"><span>{label}</span><span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"><LockKeyhole className="h-3 w-3" />Read only</span></span>
  <input value={value} readOnly className={readOnlyClass} />
</label>;

const SummaryRow: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string; value: string }> = ({ icon: Icon, label, value }) => <div className="flex items-start gap-3">
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-cyan-700 dark:bg-slate-700/60 dark:text-cyan-300"><Icon className="h-4 w-4" /></span>
  <div className="min-w-0"><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-0.5 break-words text-sm font-medium text-slate-800 dark:text-slate-100">{value}</dd></div>
</div>;

const accountStatusClass = (status: string): string => {
  if (status.toUpperCase() === 'ACTIVE') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300';
  if (status.toUpperCase() === 'SUSPENDED') return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300';
};

const ProfilePage: React.FC<ProfilePageProps> = ({ breadcrumbLabel }) => {
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '' });
  const [passwords, setPasswords] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [profileErrors, setProfileErrors] = useState<FieldErrors>({});
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});
  const [profileSuccess, setProfileSuccess] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [photoSuccess, setPhotoSuccess] = useState('');
  const [savingPhoto, setSavingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  }, [photoPreviewUrl]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await apiClient.get<AuthUser>('/profile');
        if (!active) return;
        setProfile(data); setForm({ name: data.name, email: data.email }); updateStoredUser(data);
      } catch (cause) {
        if (active) setProfileErrors(validationErrors(cause, 'Unable to load your profile. Please try again.'));
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (!form.name.trim()) errors.name = 'Full name is required.';
    if (!form.email.trim()) errors.email = 'Email is required.';
    if (Object.keys(errors).length) { setProfileErrors(errors); return; }
    setSaving(true); setProfileErrors({}); setProfileSuccess('');
    try {
      const { data } = await apiClient.put<AuthUser>('/profile', { name: form.name.trim(), email: form.email.trim() });
      setProfile(data); setForm({ name: data.name, email: data.email }); updateStoredUser(data); setProfileSuccess('Profile updated successfully.');
    } catch (cause) { setProfileErrors(validationErrors(cause, 'Unable to update your profile. Please try again.')); }
    finally { setSaving(false); }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (!passwords.current_password) errors.current_password = 'Current password is required.';
    if (!passwords.password) errors.password = 'New password is required.';
    else if (passwords.password.length < 6) errors.password = 'New password must be at least 6 characters.';
    if (!passwords.password_confirmation) errors.password_confirmation = 'Please confirm your new password.';
    else if (passwords.password !== passwords.password_confirmation) errors.password_confirmation = 'Password confirmation does not match.';
    if (Object.keys(errors).length) { setPasswordErrors(errors); return; }
    setChangingPassword(true); setPasswordErrors({}); setPasswordSuccess('');
    try {
      await apiClient.put('/profile/password', passwords);
      setPasswords({ current_password: '', password: '', password_confirmation: '' }); setPasswordSuccess('Password changed successfully.');
    } catch (cause) { setPasswordErrors(validationErrors(cause, 'Unable to change your password. Please try again.')); }
    finally { setChangingPassword(false); }
  };

  const selectPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setPhotoError('Choose a JPG, PNG, or WebP image no larger than 2 MB.');
      return;
    }

    setSelectedPhoto(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPhotoError('');
    setPhotoSuccess('');
  };

  const cancelPhotoSelection = () => {
    setSelectedPhoto(null);
    setPhotoPreviewUrl(null);
    setPhotoError('');
  };

  const uploadPhoto = async () => {
    if (!selectedPhoto) return;
    setSavingPhoto(true); setPhotoError(''); setPhotoSuccess('');
    const payload = new FormData();
    payload.append('photo', selectedPhoto);
    try {
      const { data } = await apiClient.post<AuthUser>('/profile/photo', payload);
      setProfile(data); updateStoredUser(data); setSelectedPhoto(null); setPhotoPreviewUrl(null); setPhotoSuccess('Profile photo updated.');
    } catch (cause) {
      const errors = validationErrors(cause, 'Unable to update your profile photo.');
      setPhotoError(errors.photo ?? errors.form);
    } finally { setSavingPhoto(false); }
  };

  const removePhoto = async () => {
    setSavingPhoto(true); setPhotoError(''); setPhotoSuccess('');
    try {
      const { data } = await apiClient.delete<AuthUser>('/profile/photo');
      setProfile(data); updateStoredUser(data); setSelectedPhoto(null); setPhotoPreviewUrl(null); setPhotoSuccess('Profile photo removed.');
    } catch (cause) { setPhotoError(validationErrors(cause, 'Unable to remove your profile photo.').form); }
    finally { setSavingPhoto(false); }
  };

  const focusProfileForm = () => {
    const nameInput = document.querySelector<HTMLInputElement>('input[autocomplete="name"]');
    nameInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInput?.focus({ preventScroll: true });
  };

  const relationshipName = (relationship: AuthUser['role']) => relationship?.name || 'Not Assigned';

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center gap-2 text-slate-500 dark:text-slate-400"><LoaderCircle className="h-5 w-5 animate-spin" /> Loading profile…</div>;

  return <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header><div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400"><span>{breadcrumbLabel}</span><span>/</span><span className="text-slate-900 dark:text-slate-100">Profile</span></div><h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">Profile</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage your account information and password.</p></header>
    {profileErrors.form && !profile && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{profileErrors.form}</div>}
    {profile && <>
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <section aria-labelledby="profile-summary-heading" className="self-start rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
          <div className="relative mx-auto h-20 w-20">
            <UserAvatar name={profile.name} photoUrl={photoPreviewUrl ?? profile.profile_photo_url} className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-2xl font-bold text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300" />
            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={selectPhoto} className="sr-only" />
            <button type="button" onClick={() => photoInputRef.current?.click()} disabled={savingPhoto} aria-label="Change profile photo" className="absolute -bottom-1 -right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-white bg-[#092635] text-white shadow-sm transition-colors hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800"><Camera className="h-4 w-4" aria-hidden="true" /></button>
          </div>
          <h2 id="profile-summary-heading" className="mt-4 text-center text-lg font-semibold text-slate-900 dark:text-white">{profile.name}</h2>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2"><span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700 dark:border-cyan-500/25 dark:bg-cyan-500/10 dark:text-cyan-300">{relationshipName(profile.role)}</span>{profile.status && <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${accountStatusClass(profile.status)}`}>{profile.status.toLowerCase()}</span>}</div>
          {selectedPhoto && <div className="mt-4 flex justify-center gap-2"><button type="button" onClick={cancelPhotoSelection} disabled={savingPhoto} className="min-h-11 cursor-pointer rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Cancel photo</button><button type="button" onClick={() => void uploadPhoto()} disabled={savingPhoto} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-cyan-600 px-3 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">{savingPhoto && <LoaderCircle className="h-4 w-4 animate-spin" />}Upload photo</button></div>}
          {!selectedPhoto && profile.profile_photo_url && <button type="button" onClick={() => void removePhoto()} disabled={savingPhoto} className="mx-auto mt-4 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" aria-hidden="true" />Remove photo</button>}
          {photoError && <p role="alert" className="mt-3 text-center text-xs text-rose-600 dark:text-rose-300">{photoError}</p>}
          {photoSuccess && <p role="status" className="mt-3 text-center text-xs text-emerald-700 dark:text-emerald-300">{photoSuccess}</p>}
          <button type="button" onClick={focusProfileForm} className="mx-auto mt-3 flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm font-semibold text-cyan-700 transition-colors hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-cyan-300 dark:hover:bg-cyan-500/10">Edit Profile</button>
          <dl className="mt-6 space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
            <SummaryRow icon={IdCard} label="Employee ID" value={profile.employee_id || 'Not Assigned'} />
            <SummaryRow icon={Warehouse} label="Warehouse" value={relationshipName(profile.warehouse)} />
            <SummaryRow icon={Building2} label="Department" value={relationshipName(profile.department)} />
            <SummaryRow icon={GitBranch} label="Branch" value={relationshipName(profile.branch)} />
          </dl>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-800"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300"><UserRound className="h-5 w-5"/></span><div><h2 className="font-semibold text-slate-900 dark:text-white">Profile Information</h2><p className="text-xs text-slate-500 dark:text-slate-400">Update your personal account information.</p></div></div><form onSubmit={saveProfile} className="mt-6 space-y-5">{profileErrors.form && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{profileErrors.form}</div>}{profileSuccess && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4"/>{profileSuccess}</div>}<div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={saving} autoComplete="name" className={inputClass}/><FieldError message={profileErrors.name}/></label><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Email Address<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={saving} autoComplete="email" className={inputClass}/><FieldError message={profileErrors.email}/></label><ReadOnlyField label="Employee ID" value={profile.employee_id || 'Not Assigned'} /><ReadOnlyField label="Role" value={relationshipName(profile.role)} /><ReadOnlyField label="Warehouse" value={relationshipName(profile.warehouse)} /><ReadOnlyField label="Department" value={relationshipName(profile.department)} /><ReadOnlyField label="Branch" value={relationshipName(profile.branch)} className="md:col-span-2" /></div><div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end dark:border-slate-700"><button type="button" onClick={() => setForm({ name: profile.name, email: profile.email })} disabled={saving} className="min-h-11 w-full cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{saving && <LoaderCircle className="h-4 w-4 animate-spin"/>}{saving ? 'Saving…' : 'Save Changes'}</button></div></form></section>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-700 dark:bg-slate-800"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300"><KeyRound className="h-5 w-5"/></span><div><h2 className="font-semibold text-slate-900 dark:text-white">Change Password</h2><p className="text-xs text-slate-500 dark:text-slate-400">Update your password to keep your account secure.</p></div></div><form onSubmit={changePassword} className="mt-6 space-y-5">{passwordErrors.form && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{passwordErrors.form}</div>}{passwordSuccess && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"><ShieldCheck className="h-4 w-4"/>{passwordSuccess}</div>}<div className="grid grid-cols-1 md:grid-cols-3 gap-4"><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Current Password<input type="password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} disabled={changingPassword} autoComplete="current-password" className={inputClass}/><FieldError message={passwordErrors.current_password}/></label><label className="text-sm font-medium text-slate-700 dark:text-slate-300">New Password<input type="password" value={passwords.password} onChange={(e) => setPasswords({ ...passwords, password: e.target.value })} disabled={changingPassword} autoComplete="new-password" className={inputClass}/><FieldError message={passwordErrors.password}/></label><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Confirm New Password<input type="password" value={passwords.password_confirmation} onChange={(e) => setPasswords({ ...passwords, password_confirmation: e.target.value })} disabled={changingPassword} autoComplete="new-password" className={inputClass}/><FieldError message={passwordErrors.password_confirmation}/></label></div><div className="flex justify-end border-t border-slate-200 pt-5 dark:border-slate-700"><button type="submit" disabled={changingPassword} className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{changingPassword && <LoaderCircle className="h-4 w-4 animate-spin"/>}{changingPassword ? 'Changing…' : 'Change Password'}</button></div></form></section>
    </>}
  </div>;
};

export default ProfilePage;
