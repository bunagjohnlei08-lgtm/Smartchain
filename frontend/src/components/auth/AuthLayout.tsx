import React from 'react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#091018' }}>
      <div className="max-w-md w-full p-8 rounded-2xl" style={{ backgroundColor: '#121B2A', border: '1px solid #2A3447' }}>
        {children}
      </div>
    </div>
  );
};

export default AuthLayout;