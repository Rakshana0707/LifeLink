import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
  | 'donor'
  | 'donor-dash' 
  | 'hospital' 
  | 'bloodbank' 
  | 'admin'
  | 'dashboard' 
  | 'notifications'
  | 'notification-preferences'
  | 'analytics'
  | 'forecast';

export type NormalizedRole = 'donor' | 'hospital' | 'blood_bank' | 'admin';

/**
 * Normalizes any role representation (TitleCase, snake_case, or lowercase)
 * into standard role identifier: donor | hospital | blood_bank | admin.
 */
export const normalizeRole = (role?: string | null): NormalizedRole | null => {
  if (!role) return null;
  const clean = String(role).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (clean === 'donor' || clean === 'patient') return 'donor';
  if (clean === 'hospital') return 'hospital';
  if (clean === 'blood_bank' || clean === 'bloodbank') return 'blood_bank';
  if (clean === 'admin') return 'admin';
  return null;
};

/**
 * Canonical URL path for each role's dashboard:
 * donor      -> /donor
 * hospital   -> /hospital
 * blood_bank -> /bloodbank
 * admin      -> /admin
 */
export const getRoleHomePath = (role?: string | null): string => {
  const norm = normalizeRole(role);
  switch (norm) {
    case 'donor':
      return '/donor';
    case 'hospital':
      return '/hospital';
    case 'blood_bank':
      return '/bloodbank';
    case 'admin':
      return '/admin';
    default:
      return '/login';
  }
};

/**
 * Canonical Page view for each role's dashboard:
 */
export const getRoleHomePage = (role?: string | null): Page => {
  const norm = normalizeRole(role);
  switch (norm) {
    case 'donor':
      return 'donor';
    case 'hospital':
      return 'hospital';
    case 'blood_bank':
      return 'bloodbank';
    case 'admin':
      return 'admin';
    default:
      return 'auth';
  }
};

/**
 * Maps browser path to Page identifier
 */
export const pathToPage = (pathname: string): Page => {
  const clean = (pathname || '').replace(/^\/+|\/+$/g, '').toLowerCase();
  switch (clean) {
    case '':
    case 'home':
      return 'home';
    case 'emergency':
    case 'sos':
      return 'emergency';
    case 'find-blood':
    case 'blood':
      return 'find-blood';
    case 'map':
    case 'live-map':
      return 'map';
    case 'ai-match':
    case 'aimatch':
      return 'ai-match';
    case 'camps':
      return 'camps';
    case 'leaderboard':
      return 'leaderboard';
    case 'passport':
      return 'passport';
    case 'auth':
    case 'login':
    case 'signin':
    case 'register':
      return 'auth';
    case 'donor':
    case 'donor-dash':
      return 'donor';
    case 'hospital':
      return 'hospital';
    case 'bloodbank':
    case 'blood_bank':
    case 'blood-bank':
      return 'bloodbank';
    case 'admin':
    case 'dashboard':
      return 'admin';
    case 'notifications':
      return 'notifications';
    case 'notification-preferences':
    case 'settings':
      return 'notification-preferences';
    case 'analytics':
      return 'analytics';
    case 'forecast':
      return 'forecast';
    default:
      return 'home';
  }
};

/**
 * Maps Page identifier to canonical browser path
 */
export const pageToPath = (page: Page): string => {
  switch (page) {
    case 'home':
      return '/';
    case 'donor':
    case 'donor-dash':
      return '/donor';
    case 'hospital':
      return '/hospital';
    case 'bloodbank':
      return '/bloodbank';
    case 'admin':
    case 'dashboard':
      return '/admin';
    case 'auth':
      return '/login';
    default:
      return `/${page}`;
  }
};

/**
 * Role requirements map for role-specific pages
 */
export const ROLE_PERMISSIONS: Record<string, NormalizedRole[]> = {
  'donor': ['donor'],
  'donor-dash': ['donor'],
  'hospital': ['hospital'],
  'bloodbank': ['blood_bank'],
  'admin': ['admin'],
  'dashboard': ['admin'],
  'forecast': ['admin'],
  'analytics': ['admin', 'hospital', 'blood_bank'],
};

/**
 * Check if a page requires specific roles
 */
export const isPageRoleGated = (page: Page): boolean => {
  return page in ROLE_PERMISSIONS;
};

/**
 * Check if a user's role is permitted to view a page
 */
export const isPagePermitted = (page: Page, role?: string | null): boolean => {
  const allowed = ROLE_PERMISSIONS[page];
  if (!allowed) return true; // public or generic page
  const norm = normalizeRole(role);
  if (!norm) return false;
  return allowed.includes(norm);
};

interface RoutingContextType {
  page: Page;
  navigateTo: (target: Page, routeState?: any) => void;
  routeState: any;
}

const RoutingContext = createContext<RoutingContextType | undefined>(undefined);

export const RoutingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize from browser URL path or sessionStorage fallback
  const [page, setPage] = useState<Page>(() => {
    try {
      if (typeof window !== 'undefined' && window.location.pathname) {
        const urlPage = pathToPage(window.location.pathname);
        if (urlPage !== 'home' || window.location.pathname === '/' || window.location.pathname === '/home') {
          return urlPage;
        }
      }
      const saved = sessionStorage.getItem('lifelink_current_page') as Page;
      if (saved) return saved;
    } catch {}
    return 'home';
  });

  const [routeState, setRouteState] = useState<any>(null);

  // Sync state when browser Back / Forward buttons are pressed
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      try {
        const targetPage = pathToPage(window.location.pathname);
        setPage(targetPage);
        setRouteState(e.state || null);
        try {
          sessionStorage.setItem('lifelink_current_page', targetPage);
        } catch {}
      } catch (err) {
        console.error('Error handling popstate:', err);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = useCallback((target: Page, state: any = null) => {
    setRouteState(state);
    setPage(target);
    const targetPath = pageToPath(target);

    try {
      sessionStorage.setItem('lifelink_current_page', target);
      if (typeof window !== 'undefined' && window.history) {
        if (window.location.pathname !== targetPath) {
          window.history.pushState(state, '', targetPath);
        } else {
          window.history.replaceState(state, '', targetPath);
        }
      }
    } catch {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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
