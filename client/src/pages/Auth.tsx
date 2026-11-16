import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouting, type Page, getRoleHomePage, isPagePermitted } from '../context/RoutingContext';
import { useToast } from '../context/ToastContext';
import { api } from '../api';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User as UserIcon,
  Phone,
  Building2,
  Droplet,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  X,
  FileText,
  Activity,
  Sparkles,
} from 'lucide-react';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const TAMIL_NADU_CITIES = [
  'Coimbatore Center',
  'RS Puram',
  'Peelamedu',
  'Gandhipuram',
  'Race Course',
  'Saravanampatti',
  'Vadavalli',
  'Singanallur',
  'Ukkadam',
  'Pappanaickenpalayam',
  'Ganapathy',
  'Chennai',
  'Madurai',
  'Salem',
  'Tiruchirappalli',
];

export const Auth: React.FC = () => {
  const { signup, login, googleSignIn, sendPasswordReset } = useAuth();
  const { navigateTo, routeState } = useRouting();
  const { showToast } = useToast();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'signin' | 'register'>(() => {
    if (routeState && typeof routeState === 'object' && 'tab' in routeState) {
      return routeState.tab === 'register' ? 'register' : 'signin';
    }
    return 'signin';
  });

  // Sync tab with routeState changes
  useEffect(() => {
    if (routeState && typeof routeState === 'object' && 'tab' in routeState) {
      setActiveTab(routeState.tab === 'register' ? 'register' : 'signin');
    }
  }, [routeState]);

  // General Loading & Feedback State
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [donorCount, setDonorCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .getAnalyticsSummary()
      .then((s) => {
        if (mounted && s && typeof s.totalDonors === 'number') {
          setDonorCount(s.totalDonors);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // ----------------------------------------------------
  // LOGIN FORM STATE
  // ----------------------------------------------------
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loginErrors, setLoginErrors] = useState<{ identifier?: string; password?: string }>({});

  // ----------------------------------------------------
  // REGISTRATION FORM STATE
  // ----------------------------------------------------
  // Allowed public roles (ADMIN IS STRICTLY EXCLUDED)
  type PublicRole = 'Donor' | 'Patient' | 'Hospital' | 'Blood Bank';
  const [selectedRole, setSelectedRole] = useState<PublicRole>('Donor');

  // Personal / Facility Fields
  const [fullName, setFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [city, setCity] = useState('Coimbatore Center');

  // Healthcare Verification Fields (Hospital & Blood Bank only)
  const [licenseNumber, setLicenseNumber] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Security & Compliance
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Registration Validation Errors
  const [regErrors, setRegErrors] = useState<{
    fullName?: string;
    email?: string;
    phone?: string;
    password?: string;
    confirmPassword?: string;
    licenseNumber?: string;
    terms?: string;
  }>({});

  // ----------------------------------------------------
  // FORGOT PASSWORD MODAL STATE
  // ----------------------------------------------------
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);

  // ----------------------------------------------------
  // HELPER CALCULATIONS
  // ----------------------------------------------------
  const getPasswordStrength = (pwd: string): { score: number; label: string; colorClass: string } => {
    if (!pwd) return { score: 0, label: '', colorClass: '' };
    let score = 0;
    if (pwd.length >= 6) score += 1;
    if (pwd.length >= 9) score += 1;
    if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score += 1;

    if (score === 1) return { score: 1, label: 'Weak (min. 6 characters)', colorClass: 'active-weak' };
    if (score === 2) return { score: 2, label: 'Moderate', colorClass: 'active-medium' };
    return { score: 3, label: 'Strong & secure', colorClass: 'active-strong' };
  };

  const strength = getPasswordStrength(regPassword);

  // ----------------------------------------------------
  // NAVIGATION ROUTER
  // ----------------------------------------------------
  const routeUserToPortal = (role: string) => {
    const fromPage = routeState && typeof routeState === 'object' && 'from' in routeState ? (routeState.from as Page) : null;
    if (fromPage && fromPage !== 'auth' && isPagePermitted(fromPage, role)) {
      navigateTo(fromPage);
      return;
    }
    navigateTo(getRoleHomePage(role));
  };

  // ----------------------------------------------------
  // LOGIN SUBMIT HANDLER
  // ----------------------------------------------------
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setAuthError(null);
    const errors: { identifier?: string; password?: string } = {};

    const trimmedId = loginIdentifier.trim();
    if (!trimmedId) {
      errors.identifier = 'Please enter your registered email address or username.';
    }
    if (!loginPassword) {
      errors.password = 'Please enter your password.';
    }

    if (Object.keys(errors).length > 0) {
      setLoginErrors(errors);
      return;
    }
    setLoginErrors({});

    setLoading(true);
    try {
      const loggedUser = await login(trimmedId, loginPassword, rememberMe);
      routeUserToPortal(loggedUser.role);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // REGISTRATION SUBMIT HANDLER
  // ----------------------------------------------------
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    setAuthError(null);
    const errors: typeof regErrors = {};

    const trimmedName = fullName.trim();
    const trimmedEmail = regEmail.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      errors.fullName = selectedRole === 'Hospital' || selectedRole === 'Blood Bank'
        ? 'Please enter the official facility name.'
        : 'Please enter your full legal name.';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      errors.email = 'Please enter a valid email address.';
    } else if (!emailRegex.test(trimmedEmail)) {
      errors.email = 'Please enter a valid email format (e.g., name@domain.com).';
    }

    if (!trimmedPhone) {
      errors.phone = 'Contact phone number is required for emergency dispatch.';
    } else if (trimmedPhone.replace(/[^0-9]/g, '').length < 8) {
      errors.phone = 'Please enter a valid phone number with area code.';
    }

    if (!regPassword) {
      errors.password = 'Password is required.';
    } else if (regPassword.length < 6) {
      errors.password = 'Password must be at least 6 characters.';
    }

    if (regPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match. Please re-enter.';
    }

    if (selectedRole === 'Hospital' || selectedRole === 'Blood Bank') {
      if (!licenseNumber.trim()) {
        errors.licenseNumber = 'Official healthcare clinical establishment or drug license number is required.';
      }
    }

    if (!agreeTerms) {
      errors.terms = 'You must acknowledge the terms & healthcare communications consent.';
    }

    if (Object.keys(errors).length > 0) {
      setRegErrors(errors);
      showToast('warning', 'Incomplete Form', 'Please resolve the highlighted fields to continue.');
      return;
    }
    setRegErrors({});

    // Patient role is mapped into the Donor network with recipient eligibility
    const finalRole = selectedRole === 'Patient' ? 'Donor' : selectedRole;
    const isInstitutional = finalRole === 'Hospital' || finalRole === 'Blood Bank';

    const registrationPayload = {
      name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone,
      role: finalRole as 'Donor' | 'Hospital' | 'Blood Bank',
      bloodType: finalRole === 'Donor' ? (bloodGroup || 'O+') : 'Multiple',
      location: city || 'Coimbatore Center',
      status: isInstitutional ? 'Pending Verification' : 'Active',
      isNewRegistration: true,
      password: regPassword,
      licenseNumber: licenseNumber.trim(),
      accreditationDoc: uploadedFile ? uploadedFile.name : '',
    };

    setLoading(true);
    try {
      const newUser = await signup(registrationPayload, true);
      if (isInstitutional) {
        showToast(
          'info',
          'Verification Submitted',
          'Your institutional registration has been submitted. Platform administrators will review your license credentials.'
        );
      }
      routeUserToPortal(newUser.role);
    } catch (err: any) {
      setAuthError(err.message || 'Registration could not be completed.');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // GOOGLE SIGN-IN / SIGN-UP HANDLER
  // ----------------------------------------------------
  const handleGoogleAuth = async () => {
    if (loading) return;
    setAuthError(null);
    setLoading(true);
    try {
      const targetRole = activeTab === 'register' ? selectedRole : 'Donor';
      const user = await googleSignIn(targetRole);
      routeUserToPortal(user.role);
    } catch (err: any) {
      // Friendly message handled by AuthContext, record banner if appropriate
      if (err.message && !err.message.includes('cancelled')) {
        setAuthError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // PASSWORD RESET HANDLER
  // ----------------------------------------------------
  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    const trimmed = resetEmail.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) {
      setResetError('Please enter a valid email address.');
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordReset(trimmed);
      setResetSuccess(true);
    } catch (err: any) {
      setResetError(err.message || 'Could not send reset link. Please check the email provided.');
    } finally {
      setResetLoading(false);
    }
  };

  // ----------------------------------------------------
  // QUICK-FILL DEMO SEEDED CREDENTIALS
  // ----------------------------------------------------
  const fillDemoAccount = (identifier: string, pass: string) => {
    setLoginIdentifier(identifier);
    setLoginPassword(pass);
    setLoginErrors({});
    setAuthError(null);
  };

  return (
    <div className="page active" id="auth-page">
      <div className="auth-wrap">
        
        {/* =========================================================
            LEFT COLUMN: Modern Healthcare Technology Brand Story
           ========================================================= */}
        <div className="auth-left">
          <div style={{ position: 'relative', zIndex: 1, maxWidth: '380px', width: '100%' }}>
            
            {/* LifeLink Brand Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.75rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  background: 'linear-gradient(135deg, #e74c3c, #922b21)',
                  borderRadius: '50% 50% 50% 0',
                  transform: 'rotate(-45deg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(231,76,60,.4)',
                  flexShrink: 0,
                }}
              >
                <Droplet size={22} color="#fff" style={{ transform: 'rotate(45deg)' }} />
              </div>
              <div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  LifeLink
                  <span className="pulse-dot" style={{ display: 'inline-block' }}></span>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>
                  Blood & Transfusion Logistics
                </div>
              </div>
            </div>

            {/* Headline & Value Proposition */}
            <div style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1.3, marginBottom: '.75rem', color: '#f8fafc' }}>
              {donorCount !== null ? (
                <>
                  Connecting <span style={{ color: '#f87171' }}>{donorCount}+ heroes</span> to save lives in real time.
                </>
              ) : (
                <>
                  Next-generation blood matching & <span style={{ color: '#f87171' }}>critical dispatch</span>.
                </>
              )}
            </div>

            <p style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: 1.65, marginBottom: '2rem' }}>
              LifeLink orchestrates intelligent AI matching, cold-chain verified inventory, and instant emergency alerts across Tamil Nadu hospitals and certified blood centers.
            </p>

            {/* Visual Value Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '2.5rem' }}>
              
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(231,76,60,.15)', border: '1px solid rgba(231,76,60,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', flexShrink: 0 }}>
                  <Activity size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>Real-Time Emergency Matching</div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                    Multi-tier compatibility and distance scoring routes SOS requests to nearby verified donors in seconds.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,130,246,.15)', border: '1px solid rgba(59,130,246,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', flexShrink: 0 }}>
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>Verified Healthcare Facilities</div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                    Strict institutional accreditation ensures patient safety, verified license governance, and secure data handling.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,.15)', border: '1px solid rgba(16,185,129,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', flexShrink: 0 }}>
                  <Sparkles size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#f1f5f9' }}>Digital Donor Passport & XP</div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                    Recognizing heroic contributions with verified certificates, eligibility countdowns, and impact tracking.
                  </div>
                </div>
              </div>

            </div>

            {/* Trust Footer */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,.1)', paddingTop: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
              <span>CDSCO Compliant</span>
              <span>•</span>
              <span>256-Bit SSL Security</span>
              <span>•</span>
              <span>24/7 Transfusion Support</span>
            </div>

          </div>
        </div>

        {/* =========================================================
            RIGHT COLUMN: Interactive Login & Registration Interface
           ========================================================= */}
        <div className="auth-right">
          <div className="auth-box">

            {/* Mobile Brand Header (only displayed on narrow viewports) */}
            <div style={{ display: 'none' }} className="mobile-only-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                <div className="logo-drop" style={{ width: '28px', height: '28px' }}><span>L</span></div>
                <span style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--red)' }}>LifeLink</span>
              </div>
            </div>

            {/* Main Tabs Navigation */}
            <div className="auth-tabs-nav" role="tablist" aria-label="Authentication Options">
              <button
                type="button"
                role="tab"
                id="tab-signin"
                aria-selected={activeTab === 'signin'}
                aria-controls="panel-signin"
                className={`auth-tab-btn ${activeTab === 'signin' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('signin');
                  setAuthError(null);
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                id="tab-register"
                aria-selected={activeTab === 'register'}
                aria-controls="panel-register"
                className={`auth-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('register');
                  setAuthError(null);
                }}
              >
                Register
              </button>
            </div>

            {/* Server / Auth Error Banner */}
            {authError && (
              <div className="auth-banner auth-banner-error" role="alert" aria-live="assertive">
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ flex: 1 }}>{authError}</div>
                <button
                  type="button"
                  onClick={() => setAuthError(null)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 2px' }}
                  aria-label="Dismiss message"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* =====================================================
                TAB 1: SIGN IN FORM
               ===================================================== */}
            {activeTab === 'signin' && (
              <form
                id="panel-signin"
                role="tabpanel"
                aria-labelledby="tab-signin"
                onSubmit={handleLoginSubmit}
                noValidate
              >
                <div className="auth-title">Welcome back</div>
                <div className="auth-sub">Enter your credentials to access your LifeLink portal</div>

                {/* Identifier Input */}
                <div className="form-group">
                  <label className="form-label" htmlFor="login-identifier" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <UserIcon size={13} color="var(--gr)" />
                    <span>Email or Username</span> <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <div className="input-with-icon">
                    <input
                      id="login-identifier"
                      name="username"
                      type="text"
                      className={`form-input ${loginErrors.identifier ? 'is-invalid' : ''}`}
                      placeholder="e.g. arjun@email.com or Platform Admin"
                      value={loginIdentifier}
                      onChange={(e) => {
                        setLoginIdentifier(e.target.value);
                        if (loginErrors.identifier) setLoginErrors((prev) => ({ ...prev, identifier: undefined }));
                      }}
                      autoComplete="username"
                      autoFocus
                      disabled={loading}
                      aria-invalid={!!loginErrors.identifier}
                      aria-describedby={loginErrors.identifier ? 'login-identifier-error' : undefined}
                    />
                  </div>
                  {loginErrors.identifier && (
                    <div className="form-error-msg" id="login-identifier-error">
                      <AlertCircle size={13} /> {loginErrors.identifier}
                    </div>
                  )}
                </div>

                {/* Password Input */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label className="form-label" htmlFor="login-password" style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: 0 }}>
                      <Lock size={13} color="var(--gr)" />
                      <span>Password</span> <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(loginIdentifier.includes('@') ? loginIdentifier : '');
                        setResetError(null);
                        setResetSuccess(false);
                        setShowForgotModal(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--red)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="input-with-icon">
                    <input
                      id="login-password"
                      name="password"
                      type={showLoginPassword ? 'text' : 'password'}
                      className={`form-input ${loginErrors.password ? 'is-invalid' : ''}`}
                      placeholder="Enter your account password"
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        if (loginErrors.password) setLoginErrors((prev) => ({ ...prev, password: undefined }));
                      }}
                      autoComplete="current-password"
                      disabled={loading}
                      aria-invalid={!!loginErrors.password}
                      aria-describedby={loginErrors.password ? 'login-password-error' : undefined}
                    />
                    <button
                      type="button"
                      className="input-icon-btn"
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                      tabIndex={0}
                    >
                      {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {loginErrors.password && (
                    <div className="form-error-msg" id="login-password-error">
                      <AlertCircle size={13} /> {loginErrors.password}
                    </div>
                  )}
                </div>

                {/* Remember Me Option */}
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={loading}
                    />
                    <span>
                      Remember session on this device
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--gr)', marginTop: '1px' }}>
                        Keeps you securely signed in across browser sessions.
                      </span>
                    </span>
                  </label>
                </div>

                {/* Submit Sign In Button */}
                <button
                  type="submit"
                  className="btn btn-red btn-full btn-lg"
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? (
                    <>
                      <div className="pulse-dot" style={{ backgroundColor: '#fff', marginRight: '6px' }}></div>
                      Signing In...
                    </>
                  ) : (
                    'Sign In to Dashboard'
                  )}
                </button>

                {/* Divider */}
                <div className="divider">or continue with</div>

                {/* Google Sign-In */}
                <button
                  type="button"
                  className="auth-google-btn"
                  onClick={handleGoogleAuth}
                  disabled={loading}
                  aria-label="Continue with Google"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.37 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                {/* Switch to Registration */}
                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '13px', color: 'var(--gr)' }}>
                  Don't have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('register');
                      setAuthError(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--red)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Create an account
                  </button>
                </div>

                {/* Quick-Fill Seeded Accounts Box for Review & Verification */}
                <div className="demo-accounts-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--tx)' }}>
                    <KeyRound size={13} color="var(--red)" />
                    <span>Quick Fill Seeded Accounts</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--gr)', marginTop: '2px' }}>
                    Click any pre-seeded role to test immediate dashboard access:
                  </div>
                  <div className="demo-accounts-grid">
                    <button
                      type="button"
                      className="demo-chip"
                      onClick={() => fillDemoAccount('Platform Admin', 'admin123')}
                    >
                      🛡️ Admin (admin123)
                    </button>
                    <button
                      type="button"
                      className="demo-chip"
                      onClick={() => fillDemoAccount('Sunrise Multispecialty Hospital', 'sunrise123')}
                    >
                      🏥 Hospital (sunrise123)
                    </button>
                    <button
                      type="button"
                      className="demo-chip"
                      onClick={() => fillDemoAccount('City Blood Bank', 'city123')}
                    >
                      🩸 Blood Bank (city123)
                    </button>
                    <button
                      type="button"
                      className="demo-chip"
                      onClick={() => fillDemoAccount('admin@example.test', 'admin123')}
                    >
                      📧 Admin by Email
                    </button>
                  </div>
                </div>

              </form>
            )}

            {/* =====================================================
                TAB 2: REGISTRATION FORM
               ===================================================== */}
            {activeTab === 'register' && (
              <form
                id="panel-register"
                role="tabpanel"
                aria-labelledby="tab-register"
                onSubmit={handleRegisterSubmit}
                noValidate
              >
                <div className="auth-title">Create your account</div>
                <div className="auth-sub">Select your account type to configure appropriate healthcare permissions</div>

                {/* Permitted Public Role Selection Cards */}
                <div className="form-group">
                  <label className="form-label" style={{ marginBottom: '8px' }}>
                    Account Type <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <div className="role-grid" role="radiogroup" aria-label="Select Account Type">
                    
                    {/* Donor Card */}
                    <div
                      role="radio"
                      aria-checked={selectedRole === 'Donor'}
                      tabIndex={0}
                      className={`role-card ${selectedRole === 'Donor' ? 'sel' : ''}`}
                      onClick={() => setSelectedRole('Donor')}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSelectedRole('Donor'); } }}
                    >
                      <div className="role-card-header">
                        <span className="role-icon">🩸</span>
                        {selectedRole === 'Donor' && <CheckCircle2 size={16} color="var(--red)" />}
                      </div>
                      <div className="role-name">Blood Donor</div>
                      <div className="role-desc">Donate, receive alerts, earn XP</div>
                    </div>

                    {/* Patient / Family Card */}
                    <div
                      role="radio"
                      aria-checked={selectedRole === 'Patient'}
                      tabIndex={0}
                      className={`role-card ${selectedRole === 'Patient' ? 'sel' : ''}`}
                      onClick={() => setSelectedRole('Patient')}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSelectedRole('Patient'); } }}
                    >
                      <div className="role-card-header">
                        <span className="role-icon">🩺</span>
                        {selectedRole === 'Patient' && <CheckCircle2 size={16} color="var(--red)" />}
                      </div>
                      <div className="role-name">Patient / Family</div>
                      <div className="role-desc">Request emergency units</div>
                    </div>

                    {/* Hospital Card */}
                    <div
                      role="radio"
                      aria-checked={selectedRole === 'Hospital'}
                      tabIndex={0}
                      className={`role-card ${selectedRole === 'Hospital' ? 'sel' : ''}`}
                      onClick={() => setSelectedRole('Hospital')}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSelectedRole('Hospital'); } }}
                    >
                      <div className="role-card-header">
                        <span className="role-icon">🏥</span>
                        {selectedRole === 'Hospital' && <CheckCircle2 size={16} color="var(--red)" />}
                      </div>
                      <div className="role-name">Hospital / Clinic</div>
                      <div className="role-desc">Clinical emergency requisitions</div>
                    </div>

                    {/* Blood Bank Card */}
                    <div
                      role="radio"
                      aria-checked={selectedRole === 'Blood Bank'}
                      tabIndex={0}
                      className={`role-card ${selectedRole === 'Blood Bank' ? 'sel' : ''}`}
                      onClick={() => setSelectedRole('Blood Bank')}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setSelectedRole('Blood Bank'); } }}
                    >
                      <div className="role-card-header">
                        <span className="role-icon">🏢</span>
                        {selectedRole === 'Blood Bank' && <CheckCircle2 size={16} color="var(--red)" />}
                      </div>
                      <div className="role-name">Blood Bank</div>
                      <div className="role-desc">Live inventory & transfers</div>
                    </div>

                  </div>
                </div>

                {/* Institutional Verification Notice */}
                {(selectedRole === 'Hospital' || selectedRole === 'Blood Bank') && (
                  <div className="auth-banner auth-banner-warn">
                    <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div>
                      <strong>Medical Governance Notice:</strong> Institutional facilities are registered with <em>Pending Verification</em> status. A platform administrator will verify clinical establishment credentials before bulk stock exchanges are enabled.
                    </div>
                  </div>
                )}

                {/* Full Name / Facility Name */}
                <div className="form-group">
                  <label className="form-label" htmlFor="reg-name" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {selectedRole === 'Hospital' || selectedRole === 'Blood Bank' ? (
                      <Building2 size={13} color="var(--gr)" />
                    ) : (
                      <UserIcon size={13} color="var(--gr)" />
                    )}
                    <span>{selectedRole === 'Hospital' || selectedRole === 'Blood Bank' ? 'Official Facility Name' : 'Full Name'}</span>{' '}
                    <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    id="reg-name"
                    name="name"
                    type="text"
                    className={`form-input ${regErrors.fullName ? 'is-invalid' : ''}`}
                    placeholder={
                      selectedRole === 'Hospital'
                        ? 'e.g. Apollo Speciality Hospital'
                        : selectedRole === 'Blood Bank'
                        ? 'e.g. Coimbatore Central Blood Bank'
                        : 'e.g. Arjun Sharma'
                    }
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (regErrors.fullName) setRegErrors((prev) => ({ ...prev, fullName: undefined }));
                    }}
                    autoComplete="name"
                    disabled={loading}
                    aria-invalid={!!regErrors.fullName}
                    aria-describedby={regErrors.fullName ? 'reg-name-error' : undefined}
                  />
                  {regErrors.fullName && (
                    <div className="form-error-msg" id="reg-name-error">
                      <AlertCircle size={13} /> {regErrors.fullName}
                    </div>
                  )}
                </div>

                {/* Email and Phone Grid */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-email" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Mail size={13} color="var(--gr)" />
                      <span>Email Address</span> <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <input
                      id="reg-email"
                      name="email"
                      type="email"
                      className={`form-input ${regErrors.email ? 'is-invalid' : ''}`}
                      placeholder="name@example.com"
                      value={regEmail}
                      onChange={(e) => {
                        setRegEmail(e.target.value);
                        if (regErrors.email) setRegErrors((prev) => ({ ...prev, email: undefined }));
                      }}
                      autoComplete="email"
                      disabled={loading}
                      aria-invalid={!!regErrors.email}
                      aria-describedby={regErrors.email ? 'reg-email-error' : undefined}
                    />
                    {regErrors.email && (
                      <div className="form-error-msg" id="reg-email-error">
                        <AlertCircle size={13} /> {regErrors.email}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-phone" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Phone size={13} color="var(--gr)" />
                      <span>Phone Number</span> <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <input
                      id="reg-phone"
                      name="phone"
                      type="tel"
                      className={`form-input ${regErrors.phone ? 'is-invalid' : ''}`}
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (regErrors.phone) setRegErrors((prev) => ({ ...prev, phone: undefined }));
                      }}
                      autoComplete="tel"
                      disabled={loading}
                      aria-invalid={!!regErrors.phone}
                      aria-describedby={regErrors.phone ? 'reg-phone-error' : undefined}
                    />
                    {regErrors.phone && (
                      <div className="form-error-msg" id="reg-phone-error">
                        <AlertCircle size={13} /> {regErrors.phone}
                      </div>
                    )}
                  </div>
                </div>

                {/* Role Specific Configuration */}
                {selectedRole === 'Donor' || selectedRole === 'Patient' ? (
                  <div className="form-grid-2">
                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-blood-group">
                        Blood Group <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <select
                        id="reg-blood-group"
                        className="form-input"
                        value={bloodGroup}
                        onChange={(e) => setBloodGroup(e.target.value)}
                        disabled={loading}
                      >
                        {BLOOD_GROUPS.map((bg) => (
                          <option key={bg} value={bg}>
                            {bg}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-city">
                        City / Locality <span style={{ color: 'var(--red)' }}>*</span>
                      </label>
                      <select
                        id="reg-city"
                        className="form-input"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        disabled={loading}
                      >
                        {TAMIL_NADU_CITIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="form-grid-2">
                      <div className="form-group">
                        <label className="form-label" htmlFor="reg-city-inst">
                          Facility Locality <span style={{ color: 'var(--red)' }}>*</span>
                        </label>
                        <select
                          id="reg-city-inst"
                          className="form-input"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          disabled={loading}
                        >
                          {TAMIL_NADU_CITIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="reg-license">
                          License / Registration No. <span style={{ color: 'var(--red)' }}>*</span>
                        </label>
                        <input
                          id="reg-license"
                          type="text"
                          className={`form-input ${regErrors.licenseNumber ? 'is-invalid' : ''}`}
                          placeholder="e.g. LIC-MED-2026-908"
                          value={licenseNumber}
                          onChange={(e) => {
                            setLicenseNumber(e.target.value);
                            if (regErrors.licenseNumber) setRegErrors((prev) => ({ ...prev, licenseNumber: undefined }));
                          }}
                          disabled={loading}
                          aria-invalid={!!regErrors.licenseNumber}
                          aria-describedby={regErrors.licenseNumber ? 'reg-license-error' : undefined}
                        />
                        {regErrors.licenseNumber && (
                          <div className="form-error-msg" id="reg-license-error">
                            <AlertCircle size={13} /> {regErrors.licenseNumber}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="reg-file">
                        Accreditation Certificate / License Copy (PDF/JPG)
                      </label>
                      <div
                        onClick={() => document.getElementById('reg-file-input')?.click()}
                        style={{
                          border: '1.5px dashed var(--gr4)',
                          borderRadius: 'var(--r2)',
                          padding: '12px 14px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          background: '#fafafa',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          fontSize: '13px',
                          color: uploadedFile ? 'var(--tx)' : 'var(--gr)',
                        }}
                      >
                        <FileText size={16} color={uploadedFile ? 'var(--red)' : 'var(--gr2)'} />
                        <span>
                          {uploadedFile ? uploadedFile.name : 'Click to select verification document'}
                        </span>
                      </div>
                      <input
                        id="reg-file-input"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setUploadedFile(e.target.files[0]);
                          }
                        }}
                      />
                    </div>
                  </>
                )}

                {/* Password and Confirm Password Grid */}
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-password" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Lock size={13} color="var(--gr)" />
                      <span>Password</span> <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <div className="input-with-icon">
                      <input
                        id="reg-password"
                        name="password"
                        type={showRegPassword ? 'text' : 'password'}
                        className={`form-input ${regErrors.password ? 'is-invalid' : ''}`}
                        placeholder="Min. 6 characters"
                        value={regPassword}
                        onChange={(e) => {
                          setRegPassword(e.target.value);
                          if (regErrors.password) setRegErrors((prev) => ({ ...prev, password: undefined }));
                        }}
                        autoComplete="new-password"
                        disabled={loading}
                        aria-invalid={!!regErrors.password}
                        aria-describedby={regErrors.password ? 'reg-password-error' : undefined}
                      />
                      <button
                        type="button"
                        className="input-icon-btn"
                        onClick={() => setShowRegPassword((prev) => !prev)}
                        aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                      >
                        {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {regErrors.password && (
                      <div className="form-error-msg" id="reg-password-error">
                        <AlertCircle size={13} /> {regErrors.password}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-confirm-password" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Lock size={13} color="var(--gr)" />
                      <span>Confirm Password</span> <span style={{ color: 'var(--red)' }}>*</span>
                    </label>
                    <div className="input-with-icon">
                      <input
                        id="reg-confirm-password"
                        name="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        className={`form-input ${regErrors.confirmPassword ? 'is-invalid' : ''}`}
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (regErrors.confirmPassword) setRegErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                        }}
                        autoComplete="new-password"
                        disabled={loading}
                        aria-invalid={!!regErrors.confirmPassword}
                        aria-describedby={regErrors.confirmPassword ? 'reg-confirm-password-error' : undefined}
                      />
                      <button
                        type="button"
                        className="input-icon-btn"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {regErrors.confirmPassword && (
                      <div className="form-error-msg" id="reg-confirm-password-error">
                        <AlertCircle size={13} /> {regErrors.confirmPassword}
                      </div>
                    )}
                  </div>
                </div>

                {/* Password Strength Indicator */}
                {regPassword.length > 0 && (
                  <div className="pwd-strength-wrap" style={{ marginBottom: '1rem' }}>
                    <div className="pwd-strength-bars">
                      <div className={`pwd-strength-segment ${strength.score >= 1 ? strength.colorClass : ''}`}></div>
                      <div className={`pwd-strength-segment ${strength.score >= 2 ? strength.colorClass : ''}`}></div>
                      <div className={`pwd-strength-segment ${strength.score >= 3 ? strength.colorClass : ''}`}></div>
                    </div>
                    <div className="pwd-strength-text">
                      <span>Password Strength:</span>
                      <span>{strength.label}</span>
                    </div>
                  </div>
                )}

                {/* Terms and Privacy Acknowledgement Checkbox */}
                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="form-checkbox-label">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => {
                        setAgreeTerms(e.target.checked);
                        if (regErrors.terms) setRegErrors((prev) => ({ ...prev, terms: undefined }));
                      }}
                      disabled={loading}
                    />
                    <span>
                      I agree to the{' '}
                      <span style={{ color: 'var(--red)', fontWeight: 600 }}>LifeLink Terms of Service</span> &{' '}
                      <span style={{ color: 'var(--red)', fontWeight: 600 }}>Privacy Policy</span>, and consent to vital healthcare emergency communications.
                    </span>
                  </label>
                  {regErrors.terms && (
                    <div className="form-error-msg" style={{ marginLeft: '26px' }}>
                      <AlertCircle size={13} /> {regErrors.terms}
                    </div>
                  )}
                </div>

                {/* Submit Account Creation Button */}
                <button
                  type="submit"
                  className="btn btn-red btn-full btn-lg"
                  disabled={loading}
                  aria-busy={loading}
                >
                  {loading ? (
                    <>
                      <div className="pulse-dot" style={{ backgroundColor: '#fff', marginRight: '6px' }}></div>
                      Creating Account...
                    </>
                  ) : (
                    'Complete Registration'
                  )}
                </button>

                {/* Divider */}
                <div className="divider">or continue with</div>

                {/* Google Registration */}
                <button
                  type="button"
                  className="auth-google-btn"
                  onClick={handleGoogleAuth}
                  disabled={loading}
                  aria-label="Register with Google"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.36 7.37 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.27 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>

                {/* Switch to Sign In */}
                <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '13px', color: 'var(--gr)' }}>
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('signin');
                      setAuthError(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--red)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Sign In
                  </button>
                </div>

              </form>
            )}

          </div>
        </div>

      </div>

      {/* =========================================================
          FORGOT PASSWORD MODAL (Firebase sendPasswordResetEmail)
         ========================================================= */}
      {showForgotModal && (
        <div
          className="auth-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-modal-title"
          onClick={() => setShowForgotModal(false)}
        >
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'var(--pk)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)' }}>
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 id="forgot-modal-title" style={{ fontSize: '1.15rem', fontWeight: 800 }}>Reset Password</h3>
                  <div style={{ fontSize: '12px', color: 'var(--gr)' }}>Firebase Authentication Recovery</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--gr)', cursor: 'pointer', padding: '4px' }}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            {resetSuccess ? (
              <div>
                <div className="auth-banner auth-banner-info" style={{ marginBottom: '1.5rem' }}>
                  <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <div>
                    A password reset link has been dispatched to <strong>{resetEmail.trim()}</strong>. Please check your inbox and spam folder.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-red btn-full"
                  onClick={() => {
                    setShowForgotModal(false);
                    setResetSuccess(false);
                  }}
                >
                  Return to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendResetEmail} noValidate>
                <p style={{ fontSize: '13px', color: 'var(--gr)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
                  Enter your registered account email. We'll send an official Firebase password reset email with a secure link to create a new password.
                </p>

                {resetError && (
                  <div className="auth-banner auth-banner-error">
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <div>{resetError}</div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="reset-email" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Mail size={13} color="var(--gr)" />
                    <span>Registered Email</span> <span style={{ color: 'var(--red)' }}>*</span>
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    className="form-input"
                    placeholder="name@example.com"
                    value={resetEmail}
                    onChange={(e) => {
                      setResetEmail(e.target.value);
                      if (resetError) setResetError(null);
                    }}
                    autoFocus
                    disabled={resetLoading}
                    required
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-gray"
                    style={{ flex: 1 }}
                    onClick={() => setShowForgotModal(false)}
                    disabled={resetLoading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-red"
                    style={{ flex: 1.5 }}
                    disabled={resetLoading}
                  >
                    {resetLoading ? 'Sending Link...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default Auth;
