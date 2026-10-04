import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, ClipboardCheck, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import { apiClient } from '../lib/api';

type FormState = {
  company_name: string; address: string; contact_person: string; email: string; phone: string;
  business_type: string; supply_category: string; products_services: string; website: string;
};

const emptyForm: FormState = {
  company_name: '', address: '', contact_person: '', email: '', phone: '',
  business_type: '', supply_category: '', products_services: '', website: '',
};

const SupplierApplicationPage: React.FC = () => {
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState('');

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '', form: '' }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true); setErrors({});
    try {
      const response = await apiClient.post('/supplier-applications', form);
      setReference(response.data?.data?.application_number || '');
      setForm(emptyForm);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      const validation = error?.response?.data?.errors || {};
      const next: Record<string, string> = {};
      Object.entries(validation).forEach(([key, messages]) => { next[key] = Array.isArray(messages) ? String(messages[0]) : String(messages); });
      if (!Object.keys(next).length) next.form = typeof error?.response?.data?.message === 'string'
        ? error.response.data.message
        : 'We could not submit your application. Please review the form and try again.';
      setErrors(next);
    } finally { setSubmitting(false); }
  };

  const fieldClass = 'supplier-application-field min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-950 outline-none transition-colors placeholder:text-slate-500 hover:bg-slate-50 focus:border-sky-700 focus:bg-white focus:ring-4 focus:ring-sky-700/15 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-[#0b1726] dark:text-slate-100 dark:placeholder:text-slate-400 dark:hover:bg-[#0f1d2f] dark:focus:border-sky-400 dark:focus:bg-[#0b1726] dark:focus:ring-sky-400/20 dark:disabled:bg-slate-900 dark:disabled:text-slate-500';
  const renderInput = ({ id, label, type = 'text', autoComplete, maxLength = 255 }: { id: keyof FormState; label: string; type?: string; autoComplete?: string; maxLength?: number }) => (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">{label} <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label>
      <input id={id} name={id} type={type} autoComplete={autoComplete} maxLength={maxLength} required value={form[id]} onChange={(event) => update(id, event.target.value)} aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `${id}-error` : undefined} className={fieldClass} disabled={submitting} />
      {errors[id] && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors[id]}</p>}
    </div>
  );

  return (
    <main className="supplier-application-page min-h-screen overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-[#030812] dark:text-slate-100">
      <header className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-h-11 items-center gap-3 rounded-lg focus:outline-none focus:ring-4 focus:ring-sky-400/40">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600"><Building2 className="h-5 w-5" /></span>
            <span><span className="block text-sm font-bold">SmartChain</span><span className="block text-xs text-slate-300">Supplier Application Portal</span></span>
          </Link>
          <Link to="/login" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-sky-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-4 focus:ring-sky-400/40">Staff sign in</Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:py-12">
        <section aria-labelledby="application-heading" className="lg:sticky lg:top-8 lg:self-start">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-800 dark:text-sky-400">Partner with us</p>
          <h1 id="application-heading" className="mt-3 max-w-xl text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">Apply to become a SmartChain supplier</h1>
          <p className="mt-4 max-w-[65ch] text-base leading-7 text-slate-700 dark:text-slate-300">Submit your company details for review. An application is not an active supplier account, and approval does not create login access.</p>
          <div className="mt-7 space-y-4">
            {[
              [ClipboardCheck, 'Admin review', 'Your submission is reviewed by authorized procurement staff.'],
              [ShieldCheck, 'Controlled onboarding', 'Only an approved application creates an active supplier business record.'],
              [LockKeyhole, 'No account required', 'This portal only accepts applications and never issues login credentials.'],
            ].map(([Icon, title, text]) => (
              <div key={String(title)} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0a1524]">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-400" />
                <div><h2 className="font-semibold text-slate-900 dark:text-slate-100">{String(title)}</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{String(text)}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 dark:border-white/10 dark:bg-[#081322] dark:shadow-black/30 sm:p-8">
          {reference ? (
            <div role="status" aria-live="polite" className="py-10 text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-700" />
              <h2 className="mt-5 text-2xl font-bold">Supplier application submitted successfully.</h2>
              <p className="mx-auto mt-3 max-w-lg leading-7 text-slate-600 dark:text-slate-300">Your application is pending Admin review. Save this reference number; it is the only identifier shown by the public portal.</p>
              <div className="mx-auto mt-6 max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/30 dark:bg-emerald-400/10">
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Application reference</p>
                <p className="mt-1 break-all font-mono text-lg font-bold text-emerald-950 dark:text-emerald-100">{reference}</p>
              </div>
              <button type="button" onClick={() => setReference('')} className="mt-7 min-h-11 cursor-pointer rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-400/40">Submit another application</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="border-b border-slate-200 pb-5 dark:border-slate-700"><h2 className="text-xl font-bold">Company information</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">All fields are required. Provide current business contact information.</p></div>
              {errors.form && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">{errors.form}</div>}
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">{renderInput({ id: 'company_name', label: 'Registered company name', autoComplete: 'organization' })}</div>
                {renderInput({ id: 'business_type', label: 'Business type', maxLength: 100 })}
                {renderInput({ id: 'supply_category', label: 'Primary supply category', maxLength: 150 })}
                <div className="sm:col-span-2"><label htmlFor="address" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Business address <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><textarea id="address" required rows={3} maxLength={2000} value={form.address} onChange={(event) => update('address', event.target.value)} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'address-error' : undefined} className={fieldClass} disabled={submitting} />{errors.address && <p id="address-error" role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors.address}</p>}</div>
              </div>
              <div className="mt-8 border-b border-slate-200 pb-5 dark:border-slate-700"><h2 className="text-xl font-bold">Primary contact</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">We may use these details to clarify the application.</p></div>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {renderInput({ id: 'contact_person', label: 'Contact person', autoComplete: 'name' })}
                {renderInput({ id: 'phone', label: 'Phone number', type: 'tel', autoComplete: 'tel', maxLength: 30 })}
                <div className="sm:col-span-2">{renderInput({ id: 'email', label: 'Business email', type: 'email', autoComplete: 'email' })}</div>
              </div>
              <div className="mt-8"><label htmlFor="products_services" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Products or services offered <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><textarea id="products_services" required rows={5} minLength={10} maxLength={5000} value={form.products_services} onChange={(event) => update('products_services', event.target.value)} placeholder="Describe your main products, services, capabilities, and coverage." aria-invalid={Boolean(errors.products_services)} aria-describedby={errors.products_services ? 'products-services-error' : undefined} className={fieldClass} disabled={submitting} />{errors.products_services && <p id="products-services-error" role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors.products_services}</p>}</div>
              <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0 [clip-path:inset(50%)]">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update('website', event.target.value)} />
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-300">By submitting, you confirm that the information is accurate and may be retained for supplier application review and audit purposes.</p>
              <button type="submit" disabled={submitting} className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-sky-800 focus:outline-none focus:ring-4 focus:ring-sky-700/30 disabled:cursor-not-allowed disabled:opacity-60"><Send className="h-4 w-4" />{submitting ? 'Submitting application…' : 'Submit application'}</button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
};

export default SupplierApplicationPage;
