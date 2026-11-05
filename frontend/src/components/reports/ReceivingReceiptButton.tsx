import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';
import { apiClient } from '../../lib/api';
import ReportPasswordModal, { type ReportAccessRequest } from './ReportPasswordModal';

type Receipt = { id:number; filename:string; mime:string; size:number; product:string; kind:string; reference:string };
type Evidence = { receiving_no:string; purchase_order:string; supplier:string; delivery_date:string; files:Receipt[] };

export default function ReceivingReceiptButton({ number, count }:{ number:string; count:number|null }) {
  const [open,setOpen]=useState(false);
  if(count===null)return <span>Not available for this warehouse</span>;
  return count > 0 ? <><button type="button" onClick={()=>setOpen(true)} className="min-h-11 cursor-pointer rounded-lg px-2 font-semibold text-cyan-700 hover:bg-cyan-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 dark:text-cyan-300">View Receipts ({count})</button>{open&&<ReceiptModal number={number} onClose={()=>setOpen(false)}/>}</> : <span>No Attachments</span>;
}
function ReceiptModal({number,onClose}:{number:string;onClose:()=>void}) {
  const [data,setData]=useState<Evidence|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [access,setAccess]=useState<ReportAccessRequest|null>(null),[selected,setSelected]=useState<{file:Receipt;download:boolean}|null>(null);
  const [images,setImages]=useState<Record<number,string>>({});
  const panel=useRef<HTMLDivElement>(null), close=useRef<HTMLButtonElement>(null), urls=useRef<string[]>([]);
  useEffect(()=>{let active=true;apiClient.get(`/reports/receivings/${encodeURIComponent(number)}/receipts`).then(response=>{if(active)setData(response.data);}).catch(()=>{if(active)setError('Receipt evidence could not be loaded or is not available to this account.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[number]);
  useEffect(()=>{const trigger=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;const blobUrls=urls.current;document.body.style.overflow='hidden';close.current?.focus();return()=>{document.body.style.overflow=overflow;blobUrls.forEach(url=>URL.revokeObjectURL(url));trigger?.focus();};},[]);
  useEffect(()=>{
    const trap=(root:HTMLElement|null,event:KeyboardEvent)=>{
      const nodes=root?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)');
      if(!root||!nodes?.length)return;
      const first=nodes[0],last=nodes[nodes.length-1];
      if(!root.contains(document.activeElement)){event.preventDefault();first.focus();}
      else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();
        if(access){setAccess(null);setSelected(null);requestAnimationFrame(()=>close.current?.focus());}
        else onClose();
      }
      if(event.key==='Tab')trap(access?document.querySelector<HTMLElement>('[aria-labelledby="report-password-title"]'):panel.current,event);
    };
    document.addEventListener('keydown',key,true);
    return()=>document.removeEventListener('keydown',key,true);
  },[access,onClose]);

  const request=(file:Receipt,download:boolean)=>{setSelected({file,download});setAccess({resource:`receiving-receipt:${file.id}`,format:file.mime==='application/pdf'?'PDF':'IMAGE',action:download?'DOWNLOAD':'PREVIEW',label:`${download?'download':'view'} ${file.filename}`,opensPrintWindow:!download&&file.mime==='application/pdf'});};
  const authorized=async(authorization:string,pdfWindow?:Window)=>{if(!selected)return;try{const {file,download}=selected;const response=await apiClient.get(`/reports/receivings/${encodeURIComponent(number)}/receipts/${file.id}`,{params:{download:download?1:0},responseType:'blob',headers:{'X-Report-Authorization':authorization}});const url=URL.createObjectURL(new Blob([response.data],{type:file.mime}));urls.current.push(url);if(download){const anchor=document.createElement('a');anchor.href=url;anchor.download=file.filename;anchor.click();}else if(file.mime==='application/pdf'&&pdfWindow){pdfWindow.opener=null;pdfWindow.location.href=url;}else setImages(current=>({...current,[file.id]:url}));}catch{pdfWindow?.close();setError('Receipt is unavailable or authorization expired. Please try again.');}finally{setAccess(null);setSelected(null);requestAnimationFrame(()=>close.current?.focus());}};
  return createPortal(<><div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4"><div ref={panel} inert={access!==null} role="dialog" aria-modal="true" aria-labelledby="receiving-evidence-title" className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xl"><header className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] p-5"><div><h2 id="receiving-evidence-title" className="text-lg font-bold">Supplier Delivery Receipts ? {number}</h2>{data&&<p className="mt-2 text-sm text-[var(--text-secondary)]">PO {data.purchase_order} ? {data.supplier} ? {data.delivery_date} ? {data.files.length} receipts</p>}</div><button ref={close} type="button" aria-label="Close receipts" onClick={onClose} className="grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-lg hover:bg-[var(--bg-hover)] focus:ring-2 focus:ring-cyan-500"><X className="h-5 w-5"/></button></header><div className="space-y-4 overflow-y-auto p-5">{loading&&<p role="status">Loading receipt evidence?</p>}{error&&<p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>}{data?.files.length===0&&<p>No supplier delivery receipts are attached to this receiving record.</p>}{data?.files.map(file=><article key={file.id} className="min-w-0 rounded-xl border border-[var(--border-color)] p-4"><h3 className="break-words font-semibold">{file.filename}</h3><p className="mt-1 break-words text-sm text-[var(--text-secondary)]">{file.kind} ? {file.product} ? {file.reference}</p><p className="mt-1 text-xs text-[var(--text-muted)]">{file.mime} ? {(file.size/1024).toFixed(1)} KB</p>{images[file.id]&&<img src={images[file.id]} alt={`Supplier receipt ${file.filename}`} className="mt-3 max-h-96 max-w-full rounded-lg object-contain"/>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>request(file,false)} className="min-h-11 cursor-pointer rounded-lg border border-[var(--border-color)] px-4 text-cyan-700 focus:ring-2 focus:ring-cyan-500 dark:text-cyan-300"><FileText className="mr-2 inline h-4 w-4"/>{file.mime==='application/pdf'?'Open PDF':'Preview image'}</button><button type="button" onClick={()=>request(file,true)} className="min-h-11 cursor-pointer rounded-lg border border-[var(--border-color)] px-4 focus:ring-2 focus:ring-cyan-500">Download</button></div></article>)}</div></div></div><ReportPasswordModal request={access} onCancel={()=>{setAccess(null);setSelected(null);requestAnimationFrame(()=>close.current?.focus());}} onAuthorized={authorized}/></>,document.body);
}
