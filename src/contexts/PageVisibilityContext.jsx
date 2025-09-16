import React, { createContext, useContext } from 'react';

// 創建 Page Visibility Context
const PageVisibilityContext = createContext();

// Provider 組件
export const PageVisibilityProvider = ({ children, isVisible }) => {
  return (
    <PageVisibilityContext.Provider value={{ isVisible }}>
      {children}
    </PageVisibilityContext.Provider>
  );
};

// Hook 來使用 Page Visibility Context
export const usePageVisibility = () => {
  const context = useContext(PageVisibilityContext);
  if (context === undefined) {
    throw new Error('usePageVisibility must be used within a PageVisibilityProvider');
  }
  return context;
};