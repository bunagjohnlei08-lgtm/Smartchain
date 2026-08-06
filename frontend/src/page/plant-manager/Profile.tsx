import React from 'react';

const Profile: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>Plant Manager</span>
        <span className="text-slate-900 dark:text-slate-100">Profile</span>
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Profile</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400">Profile settings coming soon.</p>
    </div>
  );
};

export default Profile;
