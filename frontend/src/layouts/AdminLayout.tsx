import AdminSidebar from '../admin/AdminSidebar';
import AdminHeader from '../admin/AdminHeader';
import { Outlet } from 'react-router-dom';

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-[#090d16] text-white overflow-hidden">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-y-auto">
        <AdminHeader />
        <main className="p-6 flex-1 min-h-screen bg-[#090d16]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
