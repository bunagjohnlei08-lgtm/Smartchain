import React, { useState } from 'react';
import Suppliers from './Suppliers';
import SupplierApplicationsTab from './SupplierApplicationsTab';
import SupplierPerformanceTab from './SupplierPerformanceTab';

type Tab = 'suppliers' | 'applications' | 'performance';

const SupplierManagement: React.FC = () => {
  const [tab, setTab] = useState<Tab>('suppliers');
  const tabs: Array<{ id: Tab; label: string }> = [{ id: 'suppliers', label: 'Suppliers' }, { id: 'applications', label: 'Applications' }, { id: 'performance', label: 'Performance' }];
  return <div className="min-h-full bg-[var(--bg-app)]"><nav aria-label="Supplier management sections" className="sticky top-0 z-20 border-b border-[var(--border-color)] bg-[var(--bg-app)]/95 px-4 pt-3 backdrop-blur sm:px-6"><div role="tablist" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-11 shrink-0 cursor-pointer border-b-2 px-4 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-500/40 ${tab === item.id ? 'border-cyan-500 text-cyan-700 dark:text-cyan-300' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}>{item.label}</button>)}</div></nav><div role="tabpanel">{tab === 'suppliers' ? <Suppliers /> : tab === 'applications' ? <SupplierApplicationsTab /> : <SupplierPerformanceTab />}</div></div>;
};

export default SupplierManagement;
