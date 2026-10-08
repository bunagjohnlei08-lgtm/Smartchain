import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardCheck, Eye, FileText, Image as ImageIcon, LockKeyhole, Plus, Send, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import logo from '../assets/logo.png';
import { apiClient } from '../lib/api';

type FormState = {
  company_name: string; owner_name: string; address: string; contact_person: string; email: string; phone: string;
  business_type: string; supply_category: string; website: string;
};
type FileField = 'business_certificate' | 'business_permit' | 'product_service_image';
type SelectedFile = { file: File; sha256: string };
type FileState = Record<FileField, SelectedFile[]>;
type DataStep = 1 | 2 | 3;
type Step = DataStep | 4;
type PreviewState = { file: File; url: string };
// Offerings are products only; the backend stores type = PRODUCT.
type Offering = { key: number; name: string; category: string; description: string };
type OfferingField = 'name' | 'category' | 'description';

const emptyForm: FormState = { company_name: '', owner_name: '', address: '', contact_person: '', email: '', phone: '', business_type: '', supply_category: '', website: '' };
const emptyFiles = (): FileState => ({ business_certificate: [], business_permit: [], product_service_image: [] });
const maxFileSize = 5 * 1024 * 1024;
const maxOfferings = 20;
const emptyOffering = (key: number): Offering => ({ key, name: '', category: '', description: '' });
const normalizeOfferingName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
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
const stepFields: Record<DataStep, (keyof FormState | FileField | 'offerings')[]> = {
  1: ['company_name', 'owner_name', 'business_type', 'supply_category', 'address'],
  2: ['business_certificate', 'business_permit', 'product_service_image'],
  3: ['contact_person', 'phone', 'email', 'offerings'],
};
const stepLabels = ['Company Information', 'Business Documents', 'Primary Contact', 'Review & Submit'];
const fileFieldLabels: Record<FileField, string> = {
  business_certificate: 'Business Certificate',
  business_permit: 'Business Permit',
  product_service_image: 'Product / Service Images',
};
const duplicateFileMessage = 'Duplicate file detected. This file has already been added to your application. Please select a different file.';
const hashFile = async (file: File): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const SupplierApplicationPage: React.FC = () => {
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState<FileState>(emptyFiles);
  const offeringKey = useRef(1);
  const [offerings, setOfferings] = useState<Offering[]>(() => [emptyOffering(0)]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState('');
  const [step, setStep] = useState<Step>(1);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [processingFiles, setProcessingFiles] = useState(false);
  const fileInputs = useRef<Partial<Record<FileField, HTMLInputElement | null>>>({});
  const fingerprints = useRef(new Set<string>());
  const processingFilesRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dialogCloseRef = useRef<HTMLButtonElement | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: '', form: '' }));
    setConfirmed(false);
  };

  const clearOfferingErrors = (current: Record<string, string>) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'offerings' && !key.startsWith('offerings.')));

  const updateOffering = (index: number, field: OfferingField, value: string) => {
    setOfferings((current) => current.map((offering, offeringIndex) => offeringIndex === index ? { ...offering, [field]: value } : offering));
    setErrors((current) => ({ ...current, [`offerings.${index}.${field}`]: '', offerings: '', form: '' }));
    setConfirmed(false);
  };

  const addOffering = () => {
    if (offerings.length >= maxOfferings) return;
    const key = offeringKey.current++;
    setOfferings((current) => [...current, emptyOffering(key)]);
    setErrors((current) => ({ ...current, offerings: '' }));
    setConfirmed(false);
    requestAnimationFrame(() => document.getElementById(`offering-${offerings.length}-name`)?.focus());
  };

  const removeOffering = (index: number) => {
    if (offerings.length <= 1) return;
    setOfferings((current) => current.filter((_, offeringIndex) => offeringIndex !== index));
    // Indexes shift after removal, so stale per-row messages are cleared.
    setErrors(clearOfferingErrors);
    setConfirmed(false);
  };

  const validateOfferings = (): Record<string, string> => {
    const next: Record<string, string> = {};
    const seen = new Set<string>();
    offerings.forEach((offering, index) => {
      const name = offering.name.trim();
      const identity = normalizeOfferingName(name);
      if (name.length < 2) next[`offerings.${index}.name`] = 'Enter the product name (at least 2 characters).';
      else if (seen.has(identity)) next[`offerings.${index}.name`] = 'Each product may only be listed once.';
      seen.add(identity);
      if (offering.category.trim().length < 2) next[`offerings.${index}.category`] = 'Enter a category for this product.';
    });
    if (offerings.length === 0) next.offerings = 'Add at least one product.';
    else if (Object.keys(next).length) next.offerings = 'Complete the highlighted product details.';
    return next;
  };

  const addFiles = async (field: FileField, selectedFiles: File[]) => {
    if (!selectedFiles.length) return;
    if (processingFilesRef.current) {
      if (fileInputs.current[field]) fileInputs.current[field]!.value = '';
      return;
    }
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

    processingFilesRef.current = true;
    setProcessingFiles(true);
    try {
      const knownFingerprints = new Set(fingerprints.current);
      const nextFiles: SelectedFile[] = [];
      for (const file of selectedFiles) {
        const sha256 = await hashFile(file);
        if (knownFingerprints.has(sha256)) {
          setErrors((current) => ({ ...current, [field]: duplicateFileMessage }));
          return;
        }
        knownFingerprints.add(sha256);
        nextFiles.push({ file, sha256 });
      }

      nextFiles.forEach(({ sha256 }) => fingerprints.current.add(sha256));
      setFiles((current) => ({ ...current, [field]: [...current[field], ...nextFiles] }));
      setErrors((current) => ({ ...current, [field]: '', form: '' }));
      setConfirmed(false);
    } catch {
      setErrors((current) => ({ ...current, [field]: 'We could not read one of the selected files. Please select it again.' }));
    } finally {
      processingFilesRef.current = false;
      setProcessingFiles(false);
      if (fileInputs.current[field]) fileInputs.current[field]!.value = '';
    }
  };

  const removeFile = (field: FileField, index: number) => {
    const removed = files[field][index];
    if (removed) fingerprints.current.delete(removed.sha256);
    setFiles((current) => ({ ...current, [field]: current[field].filter((_, fileIndex) => fileIndex !== index) }));
    setErrors((current) => ({ ...current, [field]: '' }));
    setConfirmed(false);
  };

  const openPreview = (selectedFile: SelectedFile) => {
    previewTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPreview({ file: selectedFile.file, url: URL.createObjectURL(selectedFile.file) });
  };

  const closePreview = () => {
    setPreview(null);
    requestAnimationFrame(() => previewTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!preview) return;
    const previewUrl = preview.url;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogCloseRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePreview();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], iframe, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      URL.revokeObjectURL(previewUrl);
    };
  }, [preview]);

  const fieldError = (field: keyof FormState): string => {
    const value = form[field].trim();
    if (!value) return 'This field is required.';
    if (field === 'address' && value.length < 5) return 'Enter a complete business address.';
    if (['company_name', 'owner_name', 'business_type', 'supply_category', 'contact_person'].includes(field) && value.length < 2) return 'Enter at least 2 characters.';
    if (field === 'phone' && !/^\d+$/.test(value)) return 'Phone number must contain numbers only.';
    if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid business email address.';
    return '';
  };

  const validateStep = (targetStep: DataStep): Record<string, string> => stepFields[targetStep].reduce<Record<string, string>>((next, field) => {
    if (field === 'offerings') {
      Object.assign(next, validateOfferings());
    } else if (field in files) {
      const fileField = field as FileField;
      if (files[fileField].length === 0) next[fileField] = requiredFileMessage[fileField];
      else if (files[fileField].length > maxFiles[fileField]) next[fileField] = maximumFileMessage[fileField];
    } else {
      const message = fieldError(field as keyof FormState);
      if (message) next[field] = message;
    }
    return next;
  }, {});

  const focusFirstError = (nextErrors: Record<string, string>, targetStep?: DataStep) => {
    const firstField = targetStep
      ? stepFields[targetStep].find((field) => Boolean(nextErrors[field]))
      : Object.keys(nextErrors)[0];
    if (!firstField) return;
    if (firstField === 'offerings') {
      const match = Object.keys(nextErrors).filter((key) => nextErrors[key]).map((key) => /^offerings\.(\d+)\.(\w+)$/.exec(key)).find(Boolean);
      requestAnimationFrame(() => document.getElementById(match ? `offering-${match[1]}-${match[2]}` : 'add-offering')?.focus());
      return;
    }
    requestAnimationFrame(() => document.getElementById(firstField in files ? `${firstField}-input` : firstField)?.focus());
  };

  const moveToStep = (nextStep: Step) => {
    setStep(nextStep);
    setErrors((current) => ({ ...current, form: '' }));
    requestAnimationFrame(() => {
      document.getElementById(`supplier-step-${nextStep}-heading`)?.focus();
      document.getElementById('supplier-application-form')?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  };

  const continueTo = (nextStep: Step) => {
    if (step === 4) return;
    const nextErrors = validateStep(step);
    if (Object.keys(nextErrors).length) {
      setErrors((current) => ({ ...current, ...nextErrors, form: '' }));
      focusFirstError(nextErrors, step);
      return;
    }
    moveToStep(nextStep);
  };

  const progress = step * 25;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const allErrors = ([1, 2, 3] as DataStep[]).reduce<Record<string, string>>((next, targetStep) => ({ ...next, ...validateStep(targetStep) }), {});
    if (Object.keys(allErrors).length) {
      const invalidStep = ([1, 2, 3] as DataStep[]).find((targetStep) => stepFields[targetStep].some((field) => Boolean(allErrors[field]))) || 1;
      setErrors(allErrors);
      setStep(invalidStep);
      focusFirstError(allErrors, invalidStep);
      return;
    }
    if (!confirmed) {
      setErrors((current) => ({ ...current, confirmation: 'Confirm that the information and documents are correct before submitting.' }));
      setStep(4);
      requestAnimationFrame(() => document.getElementById('application-confirmation')?.focus());
      return;
    }
    setSubmitting(true); setErrors({});
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      offerings.forEach((offering, index) => {
        payload.append(`offerings[${index}][name]`, offering.name.trim());
        if (offering.category.trim()) payload.append(`offerings[${index}][category]`, offering.category.trim());
        if (offering.description.trim()) payload.append(`offerings[${index}][description]`, offering.description.trim());
      });
      (Object.entries(files) as [FileField, SelectedFile[]][]).forEach(([key, fieldFiles]) => fieldFiles.forEach(({ file }) => payload.append(`${key}[]`, file)));
      const response = await apiClient.post('/supplier-applications', payload);
      setReference(response.data?.data?.application_number || ''); setForm(emptyForm); setFiles(emptyFiles()); setOfferings([emptyOffering(offeringKey.current++)]); setStep(1); setConfirmed(false); fingerprints.current.clear();
      Object.values(fileInputs.current).forEach((input) => { if (input) input.value = ''; });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error: any) {
      const validation = error?.response?.data?.errors || {}; const next: Record<string, string> = {};
      Object.entries(validation).forEach(([key, messages]) => {
        const message = Array.isArray(messages) ? String(messages[0]) : String(messages);
        next[key.split('.')[0]] = message;
        if (key.startsWith('offerings.')) next[key] = message;
      });
      if (!Object.keys(next).length) next.form = typeof error?.response?.data?.message === 'string' ? error.response.data.message : 'We could not submit your application. Please review the form and try again.';
      setErrors(next);
      const invalidStep = ([1, 2, 3] as DataStep[]).find((targetStep) => stepFields[targetStep].some((field) => Boolean(next[field])));
      if (invalidStep) {
        setStep(invalidStep);
        focusFirstError(next, invalidStep);
      } else if (Object.keys(next).length) {
        setStep(4);
      }
    } finally { setSubmitting(false); }
  };

  const fieldClass = 'supplier-application-field min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-base text-slate-950 outline-none transition-colors placeholder:text-slate-500 hover:bg-slate-50 focus:border-sky-700 focus:bg-white focus:ring-4 focus:ring-sky-700/15 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-[#0b1726] dark:text-slate-100 dark:placeholder:text-slate-400 dark:hover:bg-[#0f1d2f] dark:focus:border-sky-400 dark:focus:bg-[#0b1726] dark:focus:ring-sky-400/20 dark:disabled:bg-slate-900 dark:disabled:text-slate-500';
  const renderInput = ({ id, label, type = 'text', autoComplete, inputMode, maxLength = 255, digitsOnly = false }: { id: keyof FormState; label: string; type?: string; autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; maxLength?: number; digitsOnly?: boolean }) => <div><label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">{label} <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><input id={id} name={id} type={type} autoComplete={autoComplete} inputMode={inputMode} maxLength={maxLength} required value={form[id]} onChange={(event) => update(id, digitsOnly ? event.target.value.replace(/\D/g, '') : event.target.value)} aria-invalid={Boolean(errors[id])} aria-describedby={errors[id] ? `${id}-error` : undefined} className={fieldClass} disabled={submitting} />{errors[id] && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors[id]}</p>}</div>;

  const renderFileUpload = (field: FileField, label: string, description: string, imageOnly = false) => {
    const fieldFiles = files[field]; const inputId = `${field}-input`; const maximum = maxFiles[field]; const atMaximum = fieldFiles.length >= maximum;
    return <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[#0b1726]">
      <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-400/10 dark:text-sky-300">{imageOnly ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><label htmlFor={inputId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label} <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-400">{description}</p><p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">{fieldFiles.length} / {maximum}</p></div></div>
      {fieldFiles.length > 0 && <div className="mt-4 grid gap-3">{fieldFiles.map((selectedFile, index) => <div key={selectedFile.sha256} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100" title={selectedFile.file.name}>{selectedFile.file.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(selectedFile.file.size)}</p></div><button type="button" onClick={() => openPreview(selectedFile)} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sky-700 transition-colors hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-400/10" aria-label={`Preview ${selectedFile.file.name}`} title={`Preview ${selectedFile.file.name}`}><Eye className="h-4 w-4" aria-hidden="true" /></button><button type="button" onClick={() => removeFile(field, index)} disabled={submitting} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-rose-700 transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-400/10" aria-label={`Remove ${selectedFile.file.name}`} title={`Remove ${selectedFile.file.name}`}><X className="h-4 w-4" aria-hidden="true" /></button></div>)}</div>}
      <input ref={(element) => { fileInputs.current[field] = element; }} id={inputId} name={`${field}[]`} type="file" multiple accept={imageOnly ? '.jpg,.jpeg,.png,image/jpeg,image/png' : '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'} onChange={(event) => { void addFiles(field, Array.from(event.target.files || [])); }} className="sr-only" disabled={submitting || processingFiles || atMaximum} aria-invalid={Boolean(errors[field])} aria-describedby={`${field}-help${errors[field] ? ` ${field}-error` : ''}`} />
      {!atMaximum && <label htmlFor={inputId} aria-disabled={processingFiles} className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-700 px-4 py-2 text-sm font-semibold text-sky-800 transition-colors focus-within:ring-2 focus-within:ring-sky-500/40 dark:border-sky-400 dark:text-sky-300 ${processingFiles ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-400/10'}`}><Upload className="h-4 w-4" aria-hidden="true" />{processingFiles ? 'Checking files...' : `Add ${imageOnly ? 'images' : 'files'}`}</label>}
      <p id={`${field}-help`} className="mt-2 text-xs text-slate-500 dark:text-slate-400">{imageOnly ? '1–5 JPG/JPEG/PNG images required' : '1–2 PDF/JPG/JPEG/PNG files required'}, up to 5 MB each.</p>{errors[field] && <p id={`${field}-error`} role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors[field]}</p>}
    </div>;
  };

  const offeringLabelClass = 'mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200';
  const offeringError = (key: string) => errors[key] ? <p id={`${key.replace(/\./g, '-')}-error`} role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors[key]}</p> : null;
  const renderOfferings = () => <fieldset aria-describedby={errors.offerings ? 'offerings-error' : 'offerings-help'} className="min-w-0">
    <legend className="text-sm font-semibold text-slate-800 dark:text-slate-200">Products offered <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></legend>
    <p id="offerings-help" className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-400">List each product separately. Up to {maxOfferings} products.</p>
    <div className="mt-3 grid gap-4">{offerings.map((offering, index) => {
      const id = (field: OfferingField) => `offering-${index}-${field}`;
      const describedBy = (field: OfferingField) => errors[`offerings.${index}.${field}`] ? `offerings-${index}-${field}-error` : undefined;
      return <div key={offering.key} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[#0b1726]">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Product {index + 1}</h3>{offerings.length > 1 && <button type="button" onClick={() => removeOffering(index)} disabled={submitting} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-rose-700 transition-colors hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-400/10" aria-label={`Remove product ${index + 1}`} title={`Remove product ${index + 1}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}</div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label htmlFor={id('name')} className={offeringLabelClass}>Product name <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><input id={id('name')} type="text" maxLength={150} required value={offering.name} onChange={(event) => updateOffering(index, 'name', event.target.value)} placeholder="e.g. MegaAdd P4 (Powder)" aria-invalid={Boolean(errors[`offerings.${index}.name`])} aria-describedby={describedBy('name')} className={fieldClass} disabled={submitting} />{offeringError(`offerings.${index}.name`)}</div>
          <div className="sm:col-span-2"><label htmlFor={id('category')} className={offeringLabelClass}>Category <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><input id={id('category')} type="text" maxLength={150} required value={offering.category} onChange={(event) => updateOffering(index, 'category', event.target.value)} placeholder="e.g. Construction Chemicals" aria-invalid={Boolean(errors[`offerings.${index}.category`])} aria-describedby={describedBy('category')} className={fieldClass} disabled={submitting} />{offeringError(`offerings.${index}.category`)}</div>
          <div className="sm:col-span-2"><label htmlFor={id('description')} className={offeringLabelClass}>Description <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span></label><textarea id={id('description')} rows={2} maxLength={1000} value={offering.description} onChange={(event) => updateOffering(index, 'description', event.target.value)} className={fieldClass} disabled={submitting} /></div>
        </div>
      </div>;
    })}</div>
    {offerings.length < maxOfferings && <button id="add-offering" type="button" onClick={addOffering} disabled={submitting} className="mt-4 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-sky-700 px-4 py-2 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-sky-400/10 sm:w-auto"><Plus className="h-4 w-4" aria-hidden="true" />Add another product</button>}
    {errors.offerings && <p id="offerings-error" role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{errors.offerings}</p>}
  </fieldset>;

  const renderReviewFiles = (field: FileField) => <div className="mt-4"><h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fileFieldLabels[field]}</h4><ul className="mt-2 grid gap-2">{files[field].map((selectedFile) => <li key={selectedFile.sha256} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={selectedFile.file.name}>{selectedFile.file.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{formatFileSize(selectedFile.file.size)}</p></div><button type="button" onClick={() => openPreview(selectedFile)} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-sky-700 transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/40 dark:text-sky-300 dark:hover:bg-slate-800" aria-label={`Preview ${selectedFile.file.name}`} title={`Preview ${selectedFile.file.name}`}><Eye className="h-4 w-4" aria-hidden="true" /></button></li>)}</ul></div>;

  return <main className="supplier-application-page min-h-screen overflow-x-hidden bg-slate-50 text-slate-950 dark:bg-[#030812] dark:text-slate-100">
    <header className="border-b border-slate-200 bg-white text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-white"><div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6"><Link to="/" className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg focus:outline-none focus:ring-4 focus:ring-sky-500/30 sm:gap-3"><span className="flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-1 py-0.5 dark:border-slate-700"><img src={logo} alt="Archon Nell Incorporated" className="h-auto w-[56px] object-contain min-[390px]:w-[64px] min-[430px]:w-[72px] sm:w-[96px]" /></span><span className="min-w-0"><span className="block text-sm font-bold leading-5 text-slate-950 dark:text-white">SmartChain</span><span className="block whitespace-nowrap text-[10px] leading-4 text-slate-600 min-[430px]:text-[11px] dark:text-slate-300 sm:text-xs">Supplier Application Portal</span></span></Link><nav aria-label="Supplier application navigation" className="ml-auto flex shrink-0 items-center justify-end gap-1 max-[429px]:w-full"><Link to="/" aria-label="Back to Home" title="Back to Home" className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-sky-500/30 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white sm:px-3"><ArrowLeft className="h-4 w-4" aria-hidden="true" /><span className="hidden text-sm font-semibold sm:inline">Back to Home</span></Link><Link to="/login" className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-50 hover:text-sky-900 focus:outline-none focus:ring-4 focus:ring-sky-500/30 dark:text-sky-300 dark:hover:bg-white/10 dark:hover:text-white min-[390px]:text-sm sm:px-3">Staff Sign In</Link></nav></div></header>
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:py-12">
      <section aria-labelledby="application-heading" className="lg:sticky lg:top-8 lg:self-start"><p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-800 dark:text-sky-400">Partner with us</p><h1 id="application-heading" className="mt-3 max-w-xl text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">Apply to become a SmartChain supplier</h1><p className="mt-4 max-w-[65ch] text-base leading-7 text-slate-700 dark:text-slate-300">Submit your company details for review. An application is not an active supplier account, and approval does not create login access.</p><div className="mt-7 space-y-4">{[[ClipboardCheck, 'Admin review', 'Your submission is reviewed by authorized procurement staff.'], [ShieldCheck, 'Controlled onboarding', 'Only an approved application creates an active supplier business record.'], [LockKeyhole, 'No account required', 'This portal only accepts applications and never issues login credentials.']].map(([Icon, title, text]) => <div key={String(title)} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0a1524]"><Icon className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-400" /><div><h2 className="font-semibold text-slate-900 dark:text-slate-100">{String(title)}</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{String(text)}</p></div></div>)}</div></section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/5 dark:border-white/10 dark:bg-[#081322] dark:shadow-black/30 sm:p-8">
        {reference ? <div role="status" aria-live="polite" className="py-10 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-700" /><h2 className="mt-5 text-2xl font-bold">Supplier application submitted successfully.</h2><p className="mx-auto mt-3 max-w-lg leading-7 text-slate-600 dark:text-slate-300">Your application is pending Admin review. Save this reference number and check your email for the secure temporary link used to track your application.</p><div className="mx-auto mt-6 max-w-md rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-400/30 dark:bg-emerald-400/10"><p className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Application reference</p><p className="mt-1 break-all font-mono text-lg font-bold text-emerald-950 dark:text-emerald-100">{reference}</p></div><p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Estimated review time: 1–3 business days.</p><button type="button" onClick={() => setReference('')} className="mt-7 min-h-11 cursor-pointer rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-400/40">Submit another application</button></div> : <form id="supplier-application-form" onSubmit={submit} noValidate>
          <div className="border-b border-slate-200 pb-6 dark:border-slate-700">
            <div className="flex items-center justify-between gap-4"><p className="text-sm font-bold text-sky-800 dark:text-sky-300">Step {step} of 4</p><p className="text-sm font-semibold tabular-nums text-slate-600 dark:text-slate-300">{progress}% complete</p></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-label="Application completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-sky-600 transition-[width] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
            <ol className="mt-5 grid grid-cols-4 gap-1.5 sm:gap-2" aria-label="Application steps">{stepLabels.map((label, index) => { const stepNumber = (index + 1) as Step; const complete = stepNumber < step; const current = step === stepNumber; return <li key={label} aria-label={`Step ${stepNumber}: ${label}`} className={`min-w-0 rounded-xl border px-1 py-2.5 text-center sm:px-3 ${current ? 'border-sky-600 bg-sky-50 dark:border-sky-400 dark:bg-sky-400/10' : complete ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-400/10' : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40'}`} aria-current={current ? 'step' : undefined}><span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${current ? 'bg-sky-700 text-white dark:bg-sky-400 dark:text-slate-950' : complete ? 'bg-emerald-700 text-white dark:bg-emerald-400 dark:text-slate-950' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{complete && !current ? <Check className="h-4 w-4" aria-hidden="true" /> : stepNumber}</span><span className={`mt-1.5 hidden text-xs font-semibold leading-4 sm:block ${current ? 'text-sky-900 dark:text-sky-200' : 'text-slate-600 dark:text-slate-300'}`}>{label}</span></li>; })}</ol>
          </div>
          {errors.form && <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">{errors.form}</div>}

          {step === 1 && <section aria-labelledby="supplier-step-1-heading" className="pt-6"><h2 id="supplier-step-1-heading" tabIndex={-1} className="text-xl font-bold outline-none">Company Information</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Tell us about the business applying to become a SmartChain supplier.</p><div className="mt-6 grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2">{renderInput({ id: 'company_name', label: 'Registered company name', autoComplete: 'organization' })}</div><div className="sm:col-span-2">{renderInput({ id: 'owner_name', label: 'Company owner full name', autoComplete: 'name' })}</div>{renderInput({ id: 'business_type', label: 'Business type', maxLength: 100 })}{renderInput({ id: 'supply_category', label: 'Primary supply category', maxLength: 150 })}<div className="sm:col-span-2"><label htmlFor="address" className="mb-1.5 block text-sm font-semibold text-slate-800 dark:text-slate-200">Business address <span aria-hidden="true" className="text-rose-700 dark:text-rose-400">*</span></label><textarea id="address" required rows={3} maxLength={2000} value={form.address} onChange={(event) => update('address', event.target.value)} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'address-error' : undefined} className={fieldClass} disabled={submitting} />{errors.address && <p id="address-error" role="alert" className="mt-1 text-sm text-rose-700 dark:text-rose-300">{errors.address}</p>}</div></div><div className="mt-7 flex justify-end"><button type="button" onClick={() => continueTo(2)} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-sky-800 focus:outline-none focus:ring-4 focus:ring-sky-700/30 sm:w-auto">Continue <ArrowRight className="h-4 w-4" /></button></div></section>}

          {step === 2 && <section aria-labelledby="supplier-step-2-heading" className="pt-6"><h2 id="supplier-step-2-heading" tabIndex={-1} className="text-xl font-bold outline-none">Business Documents</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Upload the required documents and product or service images for review.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{renderFileUpload('business_certificate', 'Business Certificate', 'Upload 1–2 files.')}{renderFileUpload('business_permit', 'Business Permit', 'Upload 1–2 files.')}<div className="sm:col-span-2">{renderFileUpload('product_service_image', 'Product / Service Images', 'Upload images of the products or services offered.', true)}</div></div><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" onClick={() => moveToStep(1)} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-400/30 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" />Back</button><button type="button" onClick={() => continueTo(3)} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-sky-800 focus:outline-none focus:ring-4 focus:ring-sky-700/30">Continue <ArrowRight className="h-4 w-4" /></button></div></section>}

          {step === 3 && <section aria-labelledby="supplier-step-3-heading" className="pt-6"><h2 id="supplier-step-3-heading" tabIndex={-1} className="text-xl font-bold outline-none">Primary Contact</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Add the person we can contact and list the products your company offers.</p><div className="mt-6 grid gap-5 sm:grid-cols-2">{renderInput({ id: 'contact_person', label: 'Contact person', autoComplete: 'name' })}{renderInput({ id: 'phone', label: 'Phone number', type: 'tel', autoComplete: 'tel', inputMode: 'numeric', maxLength: 30, digitsOnly: true })}<div className="sm:col-span-2">{renderInput({ id: 'email', label: 'Business email', type: 'email', autoComplete: 'email' })}</div><div className="sm:col-span-2">{renderOfferings()}</div></div><div aria-hidden="true" className="pointer-events-none fixed left-0 top-0 h-px w-px overflow-hidden opacity-0 [clip-path:inset(50%)]"><label htmlFor="website">Website</label><input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update('website', event.target.value)} /></div><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" disabled={submitting} onClick={() => moveToStep(2)} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-400/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</button><button type="button" onClick={() => continueTo(4)} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-sky-800 focus:outline-none focus:ring-4 focus:ring-sky-700/30">Review application <ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div></section>}

          {step === 4 && <section aria-labelledby="supplier-step-4-heading" className="pt-6"><h2 id="supplier-step-4-heading" tabIndex={-1} className="text-xl font-bold outline-none">Review Your Application</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Please review your information and uploaded documents before submitting your application.</p><div className="mt-6 grid gap-5"><section aria-labelledby="review-company-heading" className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700 sm:p-5"><div className="flex items-start justify-between gap-4"><h3 id="review-company-heading" className="font-bold">Company Information</h3><button type="button" onClick={() => moveToStep(1)} className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-400/10">Edit</button></div><dl className="mt-3 grid gap-4 sm:grid-cols-2">{[['Registered Company Name', form.company_name], ['Company Owner', form.owner_name], ['Business Type', form.business_type], ['Primary Supply Category', form.supply_category], ['Business Address', form.address]].map(([label, value], index) => <div key={label} className={index === 4 ? 'min-w-0 sm:col-span-2' : 'min-w-0'}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900 dark:text-slate-100">{value}</dd></div>)}</dl></section><section aria-labelledby="review-documents-heading" className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700 sm:p-5"><div className="flex items-start justify-between gap-4"><h3 id="review-documents-heading" className="font-bold">Business Documents</h3><button type="button" onClick={() => moveToStep(2)} className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-400/10">Edit</button></div>{renderReviewFiles('business_certificate')}{renderReviewFiles('business_permit')}{renderReviewFiles('product_service_image')}</section><section aria-labelledby="review-contact-heading" className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700 sm:p-5"><div className="flex items-start justify-between gap-4"><h3 id="review-contact-heading" className="font-bold">Primary Contact</h3><button type="button" onClick={() => moveToStep(3)} className="min-h-11 cursor-pointer rounded-lg px-3 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-400/10">Edit</button></div><dl className="mt-3 grid gap-4 sm:grid-cols-2">{[['Contact Name', form.contact_person], ['Phone Number', form.phone], ['Email Address', form.email]].map(([label, value], index) => <div key={label} className={index >= 2 ? 'min-w-0 sm:col-span-2' : 'min-w-0'}><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm text-slate-900 dark:text-slate-100">{value}</dd></div>)}</dl><h4 className="mt-5 text-sm font-semibold text-slate-800 dark:text-slate-200">Products Offered</h4><ul className="mt-2 grid gap-2">{offerings.map((offering) => <li key={offering.key} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40"><p className="break-words text-sm font-medium text-slate-900 dark:text-slate-100">{offering.name}</p><p className="text-xs text-slate-600 dark:text-slate-400">{offering.category.trim()}</p>{offering.description.trim() && <p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-400">{offering.description.trim()}</p>}</li>)}</ul></section></div><div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40"><label htmlFor="application-confirmation" className="flex cursor-pointer items-start gap-3 text-sm font-medium leading-6 text-slate-800 dark:text-slate-200"><input id="application-confirmation" type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setErrors((current) => ({ ...current, confirmation: '' })); }} aria-invalid={Boolean(errors.confirmation)} aria-describedby={errors.confirmation ? 'confirmation-error' : undefined} className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-sky-700 focus:ring-sky-500" /><span>I confirm that the information and documents provided are correct.</span></label>{errors.confirmation && <p id="confirmation-error" role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{errors.confirmation}</p>}</div><p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-300">By submitting, you confirm that the information and attachments are accurate and may be retained for supplier application review and audit purposes.</p><div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" disabled={submitting} onClick={() => moveToStep(3)} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-400/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back</button><button type="submit" disabled={submitting || !confirmed} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors hover:bg-sky-800 focus:outline-none focus:ring-4 focus:ring-sky-700/30 disabled:cursor-not-allowed disabled:opacity-60"><Send className="h-4 w-4" aria-hidden="true" />{submitting ? 'Submitting application…' : 'Submit Application'}</button></div></section>}
        </form>}
      </section>
    </div>
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.currentTarget === event.target) closePreview(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="document-preview-heading" aria-describedby="document-preview-details" className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#081322]"><header className="flex items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5"><h2 id="document-preview-heading" className="text-lg font-bold">Document Preview</h2><button ref={dialogCloseRef} type="button" onClick={closePreview} className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500/40 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white" aria-label="Close document preview" title="Close"><X className="h-5 w-5" aria-hidden="true" /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"><div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-950">{preview.file.type === 'application/pdf' || preview.file.name.toLowerCase().endsWith('.pdf') ? <iframe src={preview.url} title={`Preview of ${preview.file.name}`} className="h-[58dvh] min-h-64 w-full bg-white" /> : <img src={preview.url} alt={`Preview of ${preview.file.name}`} className="max-h-[58dvh] w-full object-contain" />}</div><dl id="document-preview-details" className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-900/50 sm:grid-cols-3"><div className="min-w-0"><dt className="font-semibold text-slate-600 dark:text-slate-400">Filename</dt><dd className="mt-1 break-all text-slate-950 dark:text-slate-100">{preview.file.name}</dd></div><div><dt className="font-semibold text-slate-600 dark:text-slate-400">Type</dt><dd className="mt-1 text-slate-950 dark:text-slate-100">{preview.file.name.includes('.') ? preview.file.name.split('.').pop()?.toUpperCase() : preview.file.type}</dd></div><div><dt className="font-semibold text-slate-600 dark:text-slate-400">Size</dt><dd className="mt-1 text-slate-950 dark:text-slate-100">{formatFileSize(preview.file.size)}</dd></div></dl></div><footer className="border-t border-slate-200 px-4 py-3 text-right dark:border-slate-700 sm:px-5"><button type="button" onClick={closePreview} className="min-h-11 cursor-pointer rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-400/30 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300">Close</button></footer></div></div>}
  </main>;
};

export default SupplierApplicationPage;
