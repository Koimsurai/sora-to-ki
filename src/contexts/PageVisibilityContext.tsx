import { createContext, useContext, type ReactNode } from 'react';

interface PageVisibilityValue {
  isVisible: boolean;
}

// 創建 Page Visibility Context
const PageVisibilityContext = createContext<PageVisibilityValue | undefined>(undefined);

// Provider 組件
export const PageVisibilityProvider = ({ children, isVisible }: { children: ReactNode; isVisible: boolean }) => {
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
