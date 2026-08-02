import React from 'react';

const Notifications: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>Admin</span>
        <span className="text-slate-900 dark:text-slate-100">Notifications</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Notifications</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Notification management coming soon.</p>
    </div>
  );
};

export default Notifications;
