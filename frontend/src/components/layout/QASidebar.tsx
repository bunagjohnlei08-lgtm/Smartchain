import logo from '../../assets/logo.png';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  ClipboardList,
  Search,
  PackageX,
  Ban,
  History,
  BarChart3,
  Boxes,
} from 'lucide-react';

const navGroups = [
  {
    title: 'QUALITY ASSURANCE',
    items: [
      { id: 'dashboard', icon: ClipboardList, label: 'Dashboard', path: '/qa/dashboard' },
      { id: 'inspection', icon: Search, label: 'Quality Inspection', path: '/qa/inspection' },
      { id: 'damaged-items', icon: PackageX, label: 'Damaged Items', path: '/qa/damaged-items' },
      { id: 'rejected-items', icon: Ban, label: 'Rejected Items', path: '/qa/rejected-items' },
      { id: 'history', icon: History, label: 'Inspection History', path: '/qa/history' },
      { id: 'reports', icon: BarChart3, label: 'Quality Reports', path: '/qa/reports' },
      { id: 'inventory', icon: Boxes, label: 'Inventory', path: '/qa/inventory' },
    ],
  },
];

const QASidebar = () => {
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="w-64 h-screen sticky top-0 flex flex-col justify-between overflow-hidden bg-[#090d16] border-r border-slate-800/80 text-slate-300">
      <div className="flex-shrink-0 h-16 px-4 flex items-center border-b border-slate-800">
        <div className="w-10 h-10 min-w-[40px] bg-white rounded-lg flex items-center justify-center p-1 shadow-sm">
          <img src={logo} alt="Archon Nell Incorporated" className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col min-w-0 ml-3">
          <span className="text-sm font-bold text-white truncate">Archon Nell</span>
          <span className="text-[10px] font-medium tracking-wider text-slate-400 uppercase">QA SUPERVISOR</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-4 p-4 [ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navGroups.map((group) => (
          <div key={group.title}>
            <h3 className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase px-3 mt-5 mb-2">
              {group.title}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.id}
                    to={item.path}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all text-sm border-l-2 ${
                      active
                        ? 'bg-cyan-500/10 text-cyan-400 font-semibold border-l-cyan-400'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border-l-transparent'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? 'drop-shadow-[0_0_6px_rgba(0,163,196,0.6)]' : ''}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
};

export default QASidebar;
