export type RfqFieldErrors = Record<string, string>;
type SubmittedLine = { replenishment_request_id: number; product_name: string };

export function canonicalRfqUnit(unit: string): string {
  const canonical = unit.trim().toUpperCase();
  return ['PCS', 'SACK', 'DRUM'].includes(canonical) ? canonical : unit;
}

export function rfqErrorStep(key: string): number {
  if (key === 'lines' || /^line_\d+_(unit|product_id|replenishment_request_id|required_quantity|quantity|identity)$/.test(key)) return 0;
  if (['minimum_decrement', 'partial_offers_allowed', 'split_awards_allowed'].includes(key) || /^line_\d+_(specification|price)$/.test(key)) return 2;
  if (/^line_\d+_publish_reference_price$/.test(key) || key.startsWith('evaluation_') || ['show_reference_price', 'show_lowest_bid', 'eligibility_criteria', 'mandatory_compliance'].some(field => key.startsWith(field))) return 3;
  if (key.startsWith('line_')) return 0;
  if (key === 'reason' || key === 'version' || key === 'approval') return 4;
  return 1;
}

export function mapRfqValidationErrors(errors: Record<string, unknown>, lines: SubmittedLine[]): RfqFieldErrors {
  const mapped: RfqFieldErrors = {};
  for (const [rawKey, rawMessages] of Object.entries(errors)) {
    const messages = (Array.isArray(rawMessages) ? rawMessages : [rawMessages]).filter((message): message is string => typeof message === 'string');
    if (!messages.length) continue;
    const match = rawKey.match(/^lines\.(\d+)(?:\.(.+))?$/);
    let key = rawKey;
    let label = rawKey.replaceAll('_', ' ').replaceAll('.', ' ');
    let prefix = '';
    if (match) {
      const line = lines[Number(match[1])];
      const field = match[2] ?? 'identity';
      const alias = field === 'public_specification' ? 'specification' : field === 'reference_unit_price' ? 'price' : field;
      key = line ? `line_${line.replenishment_request_id}_${alias}` : 'lines';
      label = field === 'unit' ? 'stock unit' : field.replaceAll('_', ' ');
      prefix = `${line?.product_name ?? `Selected product ${Number(match[1]) + 1}`} — ${label}: `;
    } else if (rawKey.startsWith('evaluation_criteria.')) {
      key = rawKey.replace(/^evaluation_criteria\.(\d+)\./, 'evaluation_$1_');
      label = rawKey.replace(/^evaluation_criteria\.(\d+)\./, (_, index) => `criterion ${Number(index) + 1} `).replaceAll('_', ' ');
    }
    const message = prefix + messages.map(value => value.replaceAll(rawKey, label)).join(' ');
    mapped[key] = mapped[key] ? `${mapped[key]} ${message}` : message;
  }
  return mapped;
}
