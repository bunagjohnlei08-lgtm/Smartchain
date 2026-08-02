import SuperAdminSidebar from '../super-admin/SuperAdminSidebar';
import SuperAdminHeader from '../super-admin/SuperAdminHeader';
import { Outlet } from 'react-router-dom';

export default function SuperAdminLayout() {
  return (
    <div className="flex h-screen bg-[#060911] text-slate-100 overflow-hidden">
      <SuperAdminSidebar />
      <div className="flex-1 flex flex-col overflow-y-auto">
        <SuperAdminHeader />
        <main className="p-6 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
