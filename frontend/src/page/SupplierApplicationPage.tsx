import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CheckCircle2, ClipboardCheck, FileText, Image as ImageIcon, LockKeyhole, Send, ShieldCheck, Upload, X } from 'lucide-react';
import { apiClient } from '../lib/api';

type FormState = {
  company_name: string; address: string; contact_person: string; email: string; phone: string;
  business_type: string; supply_category: string; products_services: string; website: string;
};
type FileField = 'business_certificate' | 'business_permit' | 'product_service_image';
type FileState = Record<FileField, File[]>;

const emptyForm: FormState = { company_name: '', address: '', contact_person: '', email: '', phone: '', business_type: '', supply_category: '', products_services: '', website: '' };
const emptyFiles = (): FileState => ({ business_certificate: [], business_permit: [], product_service_image: [] });
const maxFileSize = 5 * 1024 * 1024;
const maxFiles: Record<FileField, number> = { business_certificate: 2, business_permit: 2, product_service_image: 5 };
const requiredFileMessage: Record<FileField, string> = {
  business_certificate: 'At least one Business Certificate is required.',
  business_permit: 'At least one Business Permit is required.',
  product_service_image: 'At least one Product / Service Image is required.',
};
const maximumFileMessage: Record<FileField, string> = {
  business_certificate: 'You may upload a maximum of 2 Business Certificate files.',
  business_permit: 'You may upload a maximum of 2 Business Permit files.',
  product_service_image: 'You may upload a maximum of 5 Product / Service Images.',
};
const formatFileSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const SupplierApplicationPage: React.FC = () => {
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<FileState>(emptyFiles);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState('');
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputs = useRef<Partial<Record<FileField, HTMLInputElement | null>>>({});

  useEffect(() => {
    const previewUrls = files.product_service_image.map((file) => URL.createObjectURL(file));
    setImagePreviews(previewUrls);
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [files.product_service_image]);

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '', form: '' }));
  };

  const addFiles = (field: FileField, selectedFiles: File[]) => {
    if (!selectedFiles.length) return;
    if (files[field].length + selectedFiles.length > maxFiles[field]) {
      setErrors((current) => ({ ...current, [field]: maximumFileMessage[field] }));
      if (fileInputs.current[field]) fileInputs.current[field]!.value = '';
      return;
    }

    const isImage = field === 'product_service_image';
    for (const file of selectedFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const validMime = isImage ? ['image/jpeg', 'image/png'].includes(file.type) : ['application/pdf', 'image/jpeg', 'image/png'].includes(file.type);
      const validExtension = isImage ? ['jpg', 'jpeg', 'png'].includes(extension) : ['pdf', 'jpg', 'jpeg', 'png'].includes(extension);
      const message = !validMime || !validExtension
        ? (isImage ? 'Choose JPG or PNG images only.' : 'Choose PDF, JPG, or PNG files only.')
        : file.size > maxFileSize ? 'Each selected file must not exceed 5 MB.' : '';
      if (!message) continue;
      setErrors((current) => ({ ...current, [field]: message }));
      if (fileInputs.current[field]) fileInputs.current[field]!.value = '';
      return;
    }

    setFiles((current) => ({ ...current, [field]: [...current[field], ...selectedFiles] }));
    setErrors((current) => ({ ...current, [field]: '', form: '' }));
    if (fileInputs.current[field]) fileInputs.current[field]!.value = '';
  };

  const removeFile = (field: FileField, index: number) => {
    setFiles((current) => ({ ...current, [field]: current[field].filter((_, fileIndex) => fileIndex !== index) }));
    setErrors((current) => ({ ...current, [field]: '' }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const attachmentErrors = (Object.keys(files) as FileField[]).reduce<Record<string, string>>((next, field) => {
      if (files[field].length === 0) next[field] = requiredFileMessage[field];
      else if (files[field].length > maxFiles[field]) next[field] = maximumFileMessage[field];
      return next;
    }, {});
    if (Object.keys(attachmentErrors).length) {
      setErrors(attachmentErrors);
      document.getElementById(`${Object.keys(attachmentErrors)[0]}-input`)?.focus();
      return;
    }
    setSubmitting(true); setErrors({});
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      (Object.entries(files) as [FileField, File[]][]).forEach(([key, fieldFiles]) => fieldFiles.forEach((file) => payload.append(`${key}[]`, file)));
      const response = await apiClient.post('/supplier-applications', payload);
      setReference(response.data?.data?.application_number || ''); setForm(emptyForm); setFiles(emptyFiles());
      Object.values(fileInputs.current).forEach((input) => { if (input) input.value = ''; });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      const validation = error?.response?.data?.errors || {}; const next: Record<string, string> = {};
      Object.entries(validation).forEach(([key, messages]) => { next[key.split('.')[0]] = Array.isArray(messages) ? String(messages[0]) : String(messages); });
      if (!Object.keys(next).length) next.form = typeof error?.response?.data?.message === 'string' ? error.response.data.message : 'We could not submit your application. Please review the form and try again.';
      setErrors(next);
    } finally { setSubmitting(false); }
  };

  const fieldClass = 'supplier-application-field min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-950 outline-none transition-colors placeholder:text-slate-500 hover:bg-slate-50 focus:border-sky-700 focus:bg-white focus:ring-4 focus:ring-sky-700/15 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-[#0b1726] dark:text-slate-100 dark:placeholder:text-slate-400 dark:hover:bg-[#0f1d2f] dark:focus:border-sky-400 dark:focus:bg-[#0b1726] dark:focus:ring-sky-400/20 dark:disabled:bg-slate-900 dark:disabled:text-slate-500';
  const renderInput = ({ id, label, type = 'text', autoComplete, maxLength = 255 }: { id: keyof FormState; label: string; type?: string; autoComplete?: string; maxLength?: number }) => <div><label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">{label} <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><input id={id} name={id} type={type} autoComplete={autoComplete} maxLength={maxLength} required value={form[id]} onChange={(event) => update(id, event.target.value)} aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `${id}-error` : undefined} className={fieldClass} disabled={submitting} />{errors[id] && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors[id]}</p>}</div>;

  const renderFileUpload = (field: FileField, label: string, description: string, imageOnly = false) => {
    const fieldFiles = files[field]; const inputId = `${field}-input`; const maximum = maxFiles[field]; const atMaximum = fieldFiles.length >= maximum;
    return <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[#0b1726]">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-400/10 dark:text-sky-300">{imageOnly ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><label htmlFor={inputId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label} <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-400">{description}</p><p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{fieldFiles.length} / {maximum}</p></div></div>
      {fieldFiles.length > 0 && <div className={`mt-4 grid gap-3 ${imageOnly ? 'grid-cols-1 min-[430px]:grid-cols-2' : 'grid-cols-1'}`}>{fieldFiles.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">{imageOnly && imagePreviews[index] && <img src={imagePreviews[index]} alt={`Preview of ${file.name}`} className="mb-3 h-28 w-full rounded-lg border border-slate-200 object-cover dark:border-slate-700" />}<div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={file.name}>{file.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(file.size)}</p></div><button type="button" onClick={() => removeFile(field, index)} disabled={submitting} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-rose-700 transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-400/10" aria-label={`Remove ${file.name}`}><X className="h-4 w-4" /></button></div></div>)}</div>}
      <input ref={(element) => { fileInputs.current[field] = element; }} id={inputId} name={`${field}[]`} type="file" multiple accept={imageOnly ? '.jpg,.jpeg,.png,image/jpeg,image/png' : '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'} onChange={(event) => addFiles(field, Array.from(event.target.files || []))} className="sr-only" disabled={submitting || atMaximum} aria-invalid={Boolean(errors[field])} aria-describedby={`${field}-help${errors[field] ? ` ${field}-error` : ''}`} />
      {!atMaximum && <label htmlFor={inputId} className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-sky-700 px-4 py-2 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-50 focus-within:ring-2 focus-within:ring-sky-500/40 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-sky-400/10"><Upload className="h-4 w-4" />Add {imageOnly ? 'images' : 'files'}</label>}
      <p id={`${field}-help`} className="mt-2 text-xs text-slate-500 dark:text-slate-400">{imageOnly ? '1–5 JPG/JPEG/PNG images required' : '1–2 PDF/JPG/JPEG/PNG files required'}, up to 5 MB each.</p>{errors[field] && <p id={`${field}-error`} role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors[field]}</p>}
    </div>;
  };

  return <main className="supplier-application-page min-h-screen overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-[#030812] dark:text-slate-100">
    <header className="border-b border-slate-200 bg-slate-950 text-white"><div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6"><Link to="/" className="flex min-h-11 items-center gap-3 rounded-lg focus:outline-none focus:ring-4 focus:ring-sky-400/40"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600"><Building2 className="h-5 w-5" /></span><span><span className="block text-sm font-bold">SmartChain</span><span className="block text-xs text-slate-300">Supplier Application Portal</span></span></Link><Link to="/login" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-sky-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-4 focus:ring-sky-400/40">Staff sign in</Link></div></header>
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:py-12">
      <section aria-labelledby="application-heading" className="lg:sticky lg:top-8 lg:self-start"><p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-800 dark:text-sky-400">Partner with us</p><h1 id="application-heading" className="mt-3 max-w-xl text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">Apply to become a SmartChain supplier</h1><p className="mt-4 max-w-[65ch] text-base leading-7 text-slate-700 dark:text-slate-300">Submit your company details for review. An application is not an active supplier account, and approval does not create login access.</p><div className="mt-7 space-y-4">{[[ClipboardCheck, 'Admin review', 'Your submission is reviewed by authorized procurement staff.'], [ShieldCheck, 'Controlled onboarding', 'Only an approved application creates an active supplier business record.'], [LockKeyhole, 'No account required', 'This portal only accepts applications and never issues login credentials.']].map(([Icon, title, text]) => <div key={String(title)} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0a1524]"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-400" /><div><h2 className="font-semibold text-slate-900 dark:text-slate-100">{String(title)}</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{String(text)}</p></div></div>)}</div></section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 dark:border-white/10 dark:bg-[#081322] dark:shadow-black/30 sm:p-8">
        {reference ? <div role="status" aria-live="polite" className="py-10 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-700" /><h2 className="mt-5 text-2xl font-bold">Supplier application submitted successfully.</h2><p className="mx-auto mt-3 max-w-lg leading-7 text-slate-600 dark:text-slate-300">Your application is pending Admin review. Save this reference number; it is the only identifier shown by the public portal.</p><div className="mx-auto mt-6 max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/30 dark:bg-emerald-400/10"><p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Application reference</p><p className="mt-1 break-all font-mono text-lg font-bold text-emerald-950 dark:text-emerald-100">{reference}</p></div><button type="button" onClick={() => setReference('')} className="mt-7 min-h-11 cursor-pointer rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-400/40">Submit another application</button></div> : <form onSubmit={submit} noValidate>
          <div className="border-b border-slate-200 pb-5 dark:border-slate-700"><h2 className="text-xl font-bold">Company information</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Business details and required supporting files are reviewed by authorized staff.</p></div>{errors.form && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">{errors.form}</div>}
          <div className="mt-6 grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2">{renderInput({ id: 'company_name', label: 'Registered company name', autoComplete: 'organization' })}</div>{renderInput({ id: 'business_type', label: 'Business type', maxLength: 100 })}{renderInput({ id: 'supply_category', label: 'Primary supply category', maxLength: 150 })}<div className="sm:col-span-2"><label htmlFor="address" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Business address <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><textarea id="address" required rows={3} maxLength={2000} value={form.address} onChange={(event) => update('address', event.target.value)} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'address-error' : undefined} className={fieldClass} disabled={submitting} />{errors.address && <p id="address-error" role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors.address}</p>}</div></div>
          <section aria-labelledby="business-documents-heading" className="mt-8"><div className="border-b border-slate-200 pb-5 dark:border-slate-700"><h2 id="business-documents-heading" className="text-xl font-bold">Business Documents <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Business Certificate and Business Permit are required for application review.</p></div><div className="mt-5 grid gap-4 sm:grid-cols-2">{renderFileUpload('business_certificate', 'Business Certificate', 'Upload 1–2 files.')}{renderFileUpload('business_permit', 'Business Permit', 'Upload 1–2 files.')}</div></section>
          <div className="mt-8 border-b border-slate-200 pb-5 dark:border-slate-700"><h2 className="text-xl font-bold">Primary contact</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">We may use these details to clarify the application.</p></div><div className="mt-6 grid gap-5 sm:grid-cols-2">{renderInput({ id: 'contact_person', label: 'Contact person', autoComplete: 'name' })}{renderInput({ id: 'phone', label: 'Phone number', type: 'tel', autoComplete: 'tel', maxLength: 30 })}<div className="sm:col-span-2">{renderInput({ id: 'email', label: 'Business email', type: 'email', autoComplete: 'email' })}</div></div>
          <section aria-labelledby="products-services-heading" className="mt-8"><h2 id="products-services-heading" className="sr-only">Products or services offered</h2><label htmlFor="products_services" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Products or services offered <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><textarea id="products_services" required rows={5} minLength={10} maxLength={5000} value={form.products_services} onChange={(event) => update('products_services', event.target.value)} placeholder="Describe your main products, services, capabilities, and coverage." aria-invalid={Boolean(errors.products_services)} aria-describedby={errors.products_services ? 'products-services-error' : undefined} className={fieldClass} disabled={submitting} />{errors.products_services && <p id="products-services-error" role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors.products_services}</p>}<div className="mt-5">{renderFileUpload('product_service_image', 'Product / Service Images', 'Upload images of the products or services offered.', true)}</div></section>
          <div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0 [clip-path:inset(50%)]"><label htmlFor="website">Website</label><input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update('website', event.target.value)} /></div><p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-300">By submitting, you confirm that the information and attachments are accurate and may be retained for supplier application review and audit purposes.</p><button type="submit" disabled={submitting} className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-sky-800 focus:outline-none focus:ring-4 focus:ring-sky-700/30 disabled:cursor-not-allowed disabled:opacity-60"><Send className="h-4 w-4" />{submitting ? 'Submitting application…' : 'Submit application'}</button>
        </form>}
      </section>
    </div>
  </main>;
};

export default SupplierApplicationPage;
