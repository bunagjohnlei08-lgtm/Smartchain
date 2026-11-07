import type { QaAttachment } from './components/EvidenceGallery';

export interface InspectionEvidence {
  inspection_id: number;
  receiving_id: number;
  receiving_no: string;
  purchase_order: string | null;
  supplier: string;
  status: string;
  completed_at: string;
  cycle_number: number;
  inspected_by: string | null;
  attachments: QaAttachment[];
}

export interface EvidenceFilters {
  search: string;
  status: string;
  availability: 'with-evidence' | 'all';
}

export function filterInspectionEvidence(inspections: InspectionEvidence[], filters: EvidenceFilters) {
  const search = filters.search.trim().toLocaleLowerCase();
  return inspections.filter((inspection) =>
    (filters.availability === 'all' || inspection.attachments.length > 0)
    && (!filters.status || inspection.status === filters.status)
    && (!search || [inspection.receiving_no, inspection.purchase_order, inspection.supplier]
      .some((value) => value?.toLocaleLowerCase().includes(search))));
}

export function paginateInspectionEvidence(inspections: InspectionEvidence[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(inspections.length / 8));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  return { page, pageCount, rows: inspections.slice((page - 1) * 8, page * 8) };
}

export function inspectionEvidenceRegister(inspections: InspectionEvidence[]): Array<Array<string | number>> {
  return [
    ['Receiving No.', 'Purchase Order', 'Inspection ID', 'Cycle', 'Supplier', 'Inspection Date', 'Inspection Result', 'QA Supervisor', 'Evidence Count', 'Filename', 'File Type', 'File Size (bytes)'],
    ...inspections.flatMap((inspection) => {
      const metadata = [inspection.receiving_no, inspection.purchase_order ?? '', inspection.inspection_id,
        inspection.cycle_number, inspection.supplier, inspection.completed_at, inspection.status,
        inspection.inspected_by ?? '', inspection.attachments.length];
      return inspection.attachments.length
        ? inspection.attachments.map((file) => [...metadata, file.original_name, file.mime_type, file.file_size])
        : [[...metadata, '', '', '']];
    }),
  ];
}
