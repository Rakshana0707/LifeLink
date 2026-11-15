import React, { createContext, useContext, useState } from 'react';

export type Page = 
  | 'home' 
  | 'emergency' 
  | 'find-blood' 
  | 'map' 
  | 'ai-match' 
  | 'camps' 
  | 'leaderboard' 
  | 'passport' 
  | 'auth' 
  | 'donor-dash' 
  | 'hospital' 
  | 'bloodbank' 
  | 'dashboard' 
  | 'notifications'
  | 'notification-preferences'
  | 'analytics'
  | 'forecast';

interface RoutingContextType {
  page: Page;
  navigateTo: (target: Page, routeState?: any) => void;
  routeState: any;
}

const RoutingContext = createContext<RoutingContextType | undefined>(undefined);

export const RoutingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [page, setPage] = useState<Page>(() => {
    try {
      const saved = sessionStorage.getItem('lifelink_current_page') as Page;
      if (saved) return saved;
    } catch {}
    return 'home';
  });
  const [routeState, setRouteState] = useState<any>(null);

  const navigateTo = (target: Page, state: any = null) => {
    setRouteState(state);
    setPage(target);
    try {
      sessionStorage.setItem('lifelink_current_page', target);
    } catch {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <RoutingContext.Provider value={{ page, navigateTo, routeState }}>
      {children}
    </RoutingContext.Provider>
  );
};

export const useRouting = () => {
  const context = useContext(RoutingContext);
  if (!context) {
    throw new Error('useRouting must be used within a RoutingProvider');
  }
  return context;
};
