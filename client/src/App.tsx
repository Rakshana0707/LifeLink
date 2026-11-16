import React, { useEffect, useRef, Suspense, lazy } from 'react';
import { ToastProvider } from './context/ToastContext';
import {
  RoutingProvider,
  useRouting,
  type Page,
  isPageRoleGated,
  isPagePermitted,
  getRoleHomePage,
} from './context/RoutingContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { Navbar } from './components/Navbar';
import { Chatbot } from './components/Chatbot';
import { Footer } from './components/Footer';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy-loaded routes for optimal bundle code-splitting
const Home = lazy(() => import('./pages/Home').then((m) => ({ default: m.Home })));
const EmergencyBoard = lazy(() => import('./pages/Emergency').then((m) => ({ default: m.EmergencyBoard })));
const FindBlood = lazy(() => import('./pages/FindBlood').then((m) => ({ default: m.FindBlood })));
const LiveMap = lazy(() => import('./pages/LiveMap').then((m) => ({ default: m.LiveMap })));
const AIMatch = lazy(() => import('./pages/AIMatch').then((m) => ({ default: m.AIMatch })));
const Camps = lazy(() => import('./pages/Camps').then((m) => ({ default: m.Camps })));
const Leaderboard = lazy(() => import('./pages/Leaderboard').then((m) => ({ default: m.Leaderboard })));
const Passport = lazy(() => import('./pages/Passport').then((m) => ({ default: m.Passport })));
const Notifications = lazy(() => import('./pages/Notifications').then((m) => ({ default: m.Notifications })));
const NotificationPreferences = lazy(() => import('./pages/NotificationPreferences').then((m) => ({ default: m.NotificationPreferences })));
const Analytics = lazy(() => import('./pages/Analytics').then((m) => ({ default: m.Analytics })));
const Forecast = lazy(() => import('./pages/Forecast').then((m) => ({ default: m.Forecast })));
const Auth = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Auth })));

// Dashboards
const AdminDashboard = lazy(() => import('./pages/Dashboards/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const DonorDashboard = lazy(() => import('./pages/Dashboards/DonorDashboard').then((m) => ({ default: m.DonorDashboard })));
const HospitalDashboard = lazy(() => import('./pages/Dashboards/HospitalDashboard').then((m) => ({ default: m.HospitalDashboard })));
const BloodBankDashboard = lazy(() => import('./pages/Dashboards/BloodBankDashboard').then((m) => ({ default: m.BloodBankDashboard })));

const PageLoading: React.FC<{ message?: string }> = ({ message = 'Loading LifeLink Portal...' }) => (
  <div
    role="status"
    aria-label={message}
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: '16px',
    }}
  >
    <div
      aria-hidden="true"
      style={{
        width: '42px',
        height: '42px',
        borderRadius: '50%',
        border: '3px solid var(--gr4)',
        borderTopColor: 'var(--red)',
        animation: 'spin 0.7s linear infinite',
      }}
    />
    <div style={{ fontSize: '13px', color: 'var(--gr)', fontWeight: 600 }}>{message}</div>
  </div>
);

// Pages that require user authentication
const PRIVATE_PAGES: Page[] = [
  'donor',
  'donor-dash',
  'hospital',
  'bloodbank',
  'admin',
  'dashboard',
  'passport',
  'notifications',
  'notification-preferences',
  'analytics',
  'forecast',
];

const AppContent: React.FC = () => {
  const { page, navigateTo } = useRouting();
  const { user, isLoggedIn, loading } = useAuth();
  const { showToast } = useToast();
  const warnedRef = useRef<string | null>(null);

  const isPrivate = PRIVATE_PAGES.includes(page);
  const isRoleGated = isPageRoleGated(page);
  const isAuthorized = !isRoleGated || (isLoggedIn && isPagePermitted(page, user?.role));

  // Role-based protection & redirect router guard
  useEffect(() => {
    if (loading) return;

    // 1. Unauthenticated access to protected route -> Redirect to login
    if (isPrivate && !isLoggedIn) {
      const warnKey = `unauth:${page}`;
      if (warnedRef.current !== warnKey) {
        warnedRef.current = warnKey;
        showToast('warning', 'Sign In Required', 'Please sign in or register to access this portal.');
      }
      navigateTo('auth', { from: page, tab: 'signin' });
      return;
    }

    // 2. Authenticated user visiting /login or /auth -> Redirect to their role dashboard
    if (isLoggedIn && page === 'auth') {
      const roleHome = getRoleHomePage(user?.role);
      navigateTo(roleHome);
      return;
    }

    // 3. Authenticated user attempting to access dashboard of another role -> Redirect to own dashboard
    if (isLoggedIn && isRoleGated && !isAuthorized) {
      const correctHome = getRoleHomePage(user?.role);
      const warnKey = `forbidden:${page}:${user?.role}`;
      if (warnedRef.current !== warnKey) {
        warnedRef.current = warnKey;
        showToast('warning', 'Access Restricted', 'You cannot access dashboards belonging to other roles.');
      }
      navigateTo(correctHome);
      return;
    }

    warnedRef.current = null;
  }, [page, isLoggedIn, loading, isPrivate, isRoleGated, isAuthorized, user?.role, navigateTo, showToast]);

  const renderPage = () => {
    // Show loading spinner while session restoration and verification is running
    if (loading) return <PageLoading message="Verifying session and security credentials..." />;

    // Block render if unauthenticated on private route
    if (isPrivate && !isLoggedIn) return <Auth />;

    // Block render if wrong role on role-gated route
    if (isLoggedIn && isRoleGated && !isAuthorized) {
      return <PageLoading message="Redirecting to authorized portal..." />;
    }

    switch (page) {
      case 'home':
        return <Home />;
      case 'emergency':
        return <EmergencyBoard />;
      case 'find-blood':
        return <FindBlood />;
      case 'map':
        return <LiveMap />;
      case 'ai-match':
        return <AIMatch />;
      case 'camps':
        return <Camps />;
      case 'leaderboard':
        return <Leaderboard />;
      case 'passport':
        return <Passport />;
      case 'notifications':
        return <Notifications />;
      case 'notification-preferences':
        return <NotificationPreferences />;
      case 'analytics':
        return <Analytics />;
      case 'forecast':
        return <Forecast />;
      case 'auth':
        return <Auth />;
      case 'donor':
      case 'donor-dash':
        return <DonorDashboard />;
      case 'hospital':
        return <HospitalDashboard />;
      case 'bloodbank':
        return <BloodBankDashboard />;
      case 'admin':
      case 'dashboard':
        return <AdminDashboard />;
      default:
        return <Home />;
    }
  };

  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Navbar />
      <main id="main-content" className="main-content" tabIndex={-1}>
        <ErrorBoundary>
          <Suspense fallback={<PageLoading />}>
            {renderPage()}
          </Suspense>
        </ErrorBoundary>
      </main>
      <Chatbot />
      <Footer />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <RoutingProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </RoutingProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
