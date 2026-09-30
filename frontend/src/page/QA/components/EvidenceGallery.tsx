import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Plus, Trash2, X } from 'lucide-react';
import { apiClient } from '../../../lib/api';

export interface QaAttachment {
  id: number;
  original_name: string;
  mime_type: string;
  file_size: number;
  view_url: string;
  created_at?: string;
}

interface EvidenceGalleryProps {
  attachments: QaAttachment[];
  receivingId: number;
  editable?: boolean;
  selectedFiles?: File[];
  removedIds?: number[];
  onSelectedFilesChange?: (files: File[]) => void;
  onRemovedIdsChange?: (ids: number[]) => void;
  error?: string | null;
  disabled?: boolean;
}

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];

function validateEvidenceFile(file: File): string | null {
  if (!allowedTypes.includes(file.type) || !/\.(jpe?g|png|pdf)$/i.test(file.name)) return 'Only JPG, PNG, or PDF files are allowed.';
  if (file.size > MAX_BYTES) return `${file.name} exceeds the 5 MB limit.`;
  return null;
}

const formatSize = (bytes: number) => bytes ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : 'Size unavailable';

const SavedImage: React.FC<{ attachment: QaAttachment; onOpen: (url: string, name: string) => void }> = ({ attachment, onOpen }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    apiClient.get(attachment.view_url, { responseType: 'blob' }).then((response) => {
      objectUrl = URL.createObjectURL(response.data);
      if (active) setUrl(objectUrl);
    }).catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.view_url]);

  return <button type="button" onClick={() => url && onOpen(url, attachment.original_name)} disabled={!url} className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:cursor-wait dark:bg-slate-800">
    {url ? <img src={url} alt={`Evidence preview: ${attachment.original_name}`} className="h-full w-full object-contain" /> : <ImageIcon className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-slate-500" />}
    <span className="absolute inset-x-0 bottom-0 bg-slate-950/75 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">Preview</span>
  </button>;
};

export const EvidenceGallery: React.FC<EvidenceGalleryProps> = ({ attachments, editable = false, selectedFiles = [], removedIds = [], onSelectedFilesChange, onRemovedIdsChange, error, disabled }) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string; owned: boolean } | null>(null);
  const visibleSaved = attachments.filter((item) => !removedIds.includes(item.id));
  const total = visibleSaved.length + selectedFiles.length;
  const slots = MAX_FILES - total;
  const selectedUrls = useMemo(() => selectedFiles.map((file) => ({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })), [selectedFiles]);

  useEffect(() => () => selectedUrls.forEach((item) => item.url && URL.revokeObjectURL(item.url)), [selectedUrls]);
  useEffect(() => {
    if (!preview) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [preview]);
  useEffect(() => () => { if (preview?.owned) URL.revokeObjectURL(preview.url); }, [preview]);

  const openSaved = async (attachment: QaAttachment) => {
    try {
      const response = await apiClient.get(attachment.view_url, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      if (attachment.mime_type === 'application/pdf') {
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else setPreview({ url, name: attachment.original_name, owned: true });
    } catch { setLocalError('Unable to open this evidence file. Please try again.'); }
  };

  const addFiles = (incoming: File[]) => {
    const validation = incoming.map(validateEvidenceFile).find(Boolean);
    if (validation) { setLocalError(validation); return; }
    if (incoming.length > slots) { setLocalError(`Only ${slots} attachment slot${slots === 1 ? '' : 's'} remaining.`); return; }
    setLocalError(null);
    onSelectedFilesChange?.([...selectedFiles, ...incoming]);
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h4 className="font-semibold text-(--text-primary)">Evidence</h4><p className="text-sm text-(--text-secondary)">JPG, PNG, or PDF • Max 5 MB each • Up to 5 files</p></div>
      <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-300">{total} / 5 files</span>
    </div>
    {total === 0 && <p className="rounded-lg border border-dashed border-(--border-color-strong) p-4 text-center text-sm text-(--text-secondary)">No evidence attached.</p>}
    <div data-qa-layout-debug="evidenceGrid" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visibleSaved.map((attachment) => <article key={attachment.id} className="min-w-0 rounded-xl border border-(--border-color-strong) bg-(--bg-surface-alt) p-3">
        {attachment.mime_type.startsWith('image/') ? <SavedImage attachment={attachment} onOpen={(url, name) => setPreview({ url, name, owned: false })} /> : <div className="flex aspect-video items-center justify-center rounded-lg bg-red-500/10"><FileText className="h-10 w-10 text-red-500" /></div>}
        <p className="mt-2 truncate text-sm font-medium text-(--text-primary)" title={attachment.original_name}>{attachment.original_name}</p>
        <p className="text-xs text-(--text-secondary)">{formatSize(attachment.file_size)}</p>
        <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => openSaved(attachment)} className="min-h-11 cursor-pointer rounded-lg border border-(--border-color-strong) px-3 text-sm hover:bg-(--bg-hover) focus-visible:outline-2 focus-visible:outline-cyan-500">{attachment.mime_type === 'application/pdf' ? 'View PDF' : 'Preview'}</button>
          {editable && <button type="button" disabled={disabled} onClick={() => onRemovedIdsChange?.([...removedIds, attachment.id])} aria-label={`Remove ${attachment.original_name}`} className="min-h-11 cursor-pointer rounded-lg px-3 text-sm text-red-700 hover:bg-red-500/10 focus-visible:outline-2 focus-visible:outline-red-500 disabled:opacity-50 dark:text-red-300"><Trash2 className="mr-1 inline h-4 w-4" />Remove</button>}
        </div>
      </article>)}
      {selectedUrls.map(({ file, url }, index) => <article key={`${file.name}-${file.lastModified}-${index}`} className="min-w-0 rounded-xl border border-cyan-500/40 bg-cyan-500/5 p-3">
        {url ? <button type="button" onClick={() => setPreview({ url, name: file.name, owned: false })} className="aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-slate-200 focus-visible:outline-2 focus-visible:outline-cyan-500 dark:bg-slate-800"><img src={url} alt={`Selected evidence: ${file.name}`} className="h-full w-full object-contain" /></button> : <div className="flex aspect-video items-center justify-center rounded-lg bg-red-500/10"><FileText className="h-10 w-10 text-red-500" /></div>}
        <p className="mt-2 truncate text-sm font-medium" title={file.name}>{file.name}</p><p className="text-xs text-(--text-secondary)">{formatSize(file.size)} • Ready to upload</p>
        <div className="mt-2 flex gap-2">{file.type === 'application/pdf' && <button type="button" onClick={() => { const pdfUrl = URL.createObjectURL(file); window.open(pdfUrl, '_blank', 'noopener,noreferrer'); setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000); }} className="min-h-11 cursor-pointer rounded-lg border border-(--border-color-strong) px-3 text-sm">View PDF</button>}<button type="button" disabled={disabled} onClick={() => onSelectedFilesChange?.(selectedFiles.filter((_, itemIndex) => itemIndex !== index))} className="min-h-11 cursor-pointer rounded-lg px-3 text-sm text-red-700 hover:bg-red-500/10 dark:text-red-300">Remove</button></div>
      </article>)}
    </div>
    {editable && slots > 0 && <><input ref={inputRef} id={inputId} type="file" multiple accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" className="sr-only" disabled={disabled} onChange={(event) => { addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ''; }} /><button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-(--border-color-strong) px-4 text-sm font-medium hover:bg-(--bg-hover) focus-visible:outline-2 focus-visible:outline-cyan-500 disabled:opacity-50"><Plus className="h-4 w-4" />Add files <span className="text-(--text-secondary)">({slots} remaining)</span></button></>}
    {(error || localError) && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error || localError}</p>}
    {preview && <div role="dialog" aria-modal="true" aria-label={`Preview ${preview.name}`} onClick={() => setPreview(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-3 sm:p-6"><div onClick={(event) => event.stopPropagation()} className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-[#0d1322]"><div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700"><p className="truncate font-medium">{preview.name}</p><button type="button" onClick={() => setPreview(null)} aria-label="Close preview" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-500 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button></div><div className="min-h-0 flex-1 overflow-auto p-3"><img src={preview.url} alt={`Large preview of ${preview.name}`} className="mx-auto max-h-[calc(100vh-8rem)] max-w-full object-contain" /></div></div></div>}
  </div>;
};
