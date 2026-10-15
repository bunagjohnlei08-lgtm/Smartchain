import React from 'react';
import { PAGE_CONTENT_CLASS } from './pageLayout';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

const PageContainer: React.FC<PageContainerProps> = ({ children, className = '' }) => {
  return (
    <div className={`${PAGE_CONTENT_CLASS} bg-slate-50 dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 ${className}`}>
      {children}
    </div>
  );
};

export default PageContainer;
