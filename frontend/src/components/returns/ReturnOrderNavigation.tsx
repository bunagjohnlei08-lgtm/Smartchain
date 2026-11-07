import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { legacyReturnDestination, RETURN_ORDER_NAVIGATION } from './customerReturnUi';

/** Keeps the former host pages useful without embedding return processing. */
export default function ReturnOrderNavigation({ mode, children }: { mode: 'admin' | 'qa'; children: ReactNode }) {
  const location = useLocation();
  const legacy = legacyReturnDestination(location.pathname, location.search, location.hash);
  if (legacy) return <Navigate to={legacy} replace />;
  const destination = RETURN_ORDER_NAVIGATION[mode];
  return <div className="min-w-0">
    <nav aria-label="Related return workflow" className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#0d1322]">
      <Link to={destination.path} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-cyan-700 hover:bg-cyan-50 focus-visible:outline-2 focus-visible:outline-cyan-500 dark:text-cyan-300 dark:hover:bg-slate-800">{destination.label}</Link>
    </nav>
    {children}
  </div>;
}
