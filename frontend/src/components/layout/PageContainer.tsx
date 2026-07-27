import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
}

const PageContainer: React.FC<PageContainerProps> = ({ children }) => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#091018]">
      <main className="flex-1 overflow-y-auto py-6">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default PageContainer;
