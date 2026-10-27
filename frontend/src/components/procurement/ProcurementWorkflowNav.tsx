import { NavLink } from 'react-router-dom';

export type ProcurementSection = 'replenishment' | 'sourcing' | 'rfqs' | 'bidding' | 'evaluation';

const items: Array<{ id: ProcurementSection; label: string; to: string; description: string }> = [
  { id: 'replenishment', label: 'Replenishment', to: '/admin/procurement', description: 'Review and approve warehouse replenishment requests.' },
  { id: 'sourcing', label: 'Product Sourcing', to: '/admin/procurement/sourcing', description: 'Manage approved requirements for competitive sourcing.' },
  { id: 'rfqs', label: 'RFQ Records', to: '/admin/procurement/rfqs', description: 'Track RFQs from draft through publication and completion.' },
  { id: 'bidding', label: 'Bidding Activity', to: '/admin/procurement/bidding', description: 'Monitor submitted quotations and bid revision history.' },
  { id: 'evaluation', label: 'Evaluation & Awards', to: '/admin/procurement/evaluations', description: 'Compare supplier offers, complete evaluations, and review awards.' },
];

export default function ProcurementWorkflowNav({ active }: { active: ProcurementSection }) {
  const current = items.find(item => item.id === active) ?? items[0];
  return <div className="sticky top-0 z-20 mt-5 bg-[var(--bg-app)]/95 pb-3 backdrop-blur">
    <nav aria-label="Procurement workflow sections" className="border-b border-[var(--border-color)]">
      <div className="flex max-w-full gap-1 overflow-x-auto" role="tablist">
        {items.map(item => <NavLink key={item.id} to={item.to} role="tab" aria-selected={active === item.id} aria-current={active === item.id ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center border-b-2 px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500 ${active === item.id ? 'border-cyan-500 text-cyan-700 dark:text-cyan-300' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>{item.label}</NavLink>)}
      </div>
    </nav>
    <p className="mt-3 text-sm text-[var(--text-muted)]">{current.description}</p>
  </div>;
}
