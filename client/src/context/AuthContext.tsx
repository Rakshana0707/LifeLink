import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, setApiActor, type User } from '../api';
import { useToast } from './ToastContext';
import { auth } from '../firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  role: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  logout: () => Promise<void>;
  signup: (userData: Partial<User> & { password?: string; email: string }) => Promise<User>;
  login: (identifier: string, password: string) => Promise<User>;
  googleSignIn: (role?: 'Donor' | 'Patient' | 'Hospital' | 'Blood Bank') => Promise<User>;
  refreshUser: () => Promise<void>;
  updateUserContext: (updateData: any) => Promise<void>;
  usersList: User[];
  reloadUsersList: () => Promise<void>;
}

// Format auth errors into clean, user-friendly messages
const getFriendlyErrorMessage = (err: any): string => {
  const code = err?.code || '';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/invalid-email':
      return 'The email address format is invalid.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please check your credentials.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    default:
      return err?.message?.replace(/^Firebase:\s*/, '') || 'Authentication failed.';
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [usersList, setUsersList] = useState<User[]>([]);
  const { showToast } = useToast();
  const isInitializingRef = useRef(true);

  const reloadUsersList = useCallback(async () => {
    try {
      const list = await api.getUsers();
      setUsersList(list);
    } catch (err: any) {
      console.warn('Failed to refresh users list:', err.message);
    }
  }, []);

  // Main session restoration & auth state listener (Single listener pattern)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // 1. Firebase Auth user is present
          const token = await firebaseUser.getIdToken();
          setApiActor(token);

          try {
            // Attempt to fetch user profile from SQLite
            const profile = await api.getCurrentUser();
            setUser(profile);
            localStorage.setItem('lifelink_user', JSON.stringify(profile));
          } catch {
            // Auto-heal orphaned or newly created Firebase accounts via backend sync
            try {
              const synced = await api.syncUser({
                email: firebaseUser.email || undefined,
                name: firebaseUser.displayName || undefined,
                firebaseUid: firebaseUser.uid,
                role: 'Donor',
              });
              setUser(synced);
              localStorage.setItem('lifelink_user', JSON.stringify(synced));
            } catch (syncErr: any) {
              console.error('Failed to sync profile for Firebase user:', syncErr.message);
            }
          }
        } else {
          // 2. Firebase user is null. Check if an internal session token exists (for Demo / Admin accounts)
          const localToken = localStorage.getItem('lifelink_token');
          const savedUserStr = localStorage.getItem('lifelink_user');

          if (localToken && savedUserStr) {
            setApiActor(localToken);
            try {
              const verifiedProfile = await api.getCurrentUser();
              setUser(verifiedProfile);
              localStorage.setItem('lifelink_user', JSON.stringify(verifiedProfile));
            } catch {
              // Token expired or invalid, clear session
              setApiActor(null);
              setUser(null);
              localStorage.removeItem('lifelink_user');
            }
          } else {
            setApiActor(null);
            setUser(null);
            localStorage.removeItem('lifelink_user');
          }
        }
      } catch (err) {
        console.error('Error during auth state change processing:', err);
      } finally {
        if (isInitializingRef.current) {
          isInitializingRef.current = false;
          setLoading(false);
        }
      }
    });

    // Populate user directory in background
    api.getUsers().then(setUsersList).catch(() => {});

    return () => unsubscribe();
  }, []);

  const login = async (identifier: string, password: string): Promise<User> => {
    const trimmedId = identifier.trim();
    let loggedUser: User | null = null;
    let authError: any = null;

    // 1. If identifier looks like an email, try Firebase Auth first
    if (trimmedId.includes('@')) {
      try {
        const fbCred = await signInWithEmailAndPassword(auth, trimmedId, password);
        const token = await fbCred.user.getIdToken();
        setApiActor(token);

        // Fetch or auto-sync SQLite profile
        try {
          loggedUser = await api.getCurrentUser();
        } catch {
          loggedUser = await api.syncUser({
            email: fbCred.user.email || trimmedId,
            firebaseUid: fbCred.user.uid,
            name: fbCred.user.displayName || trimmedId.split('@')[0],
            role: 'Donor',
          });
        }
      } catch (fbErr: any) {
        authError = fbErr;
      }
    }

    // 2. If Firebase login didn't succeed or identifier is a username, try backend login (Demo & Admin accounts)
    if (!loggedUser) {
      try {
        const res = await api.login(trimmedId, password);
        loggedUser = res;
        setApiActor(res.token);
        // Clear any leftover Firebase session so demo auth is clean
        await signOut(auth).catch(() => {});
      } catch (localErr: any) {
        // If both failed, use the most relevant error
        const chosenErr = authError || localErr;
        const friendlyMsg = getFriendlyErrorMessage(chosenErr);
        showToast('warning', '❌ Sign In Failed', friendlyMsg);
        throw new Error(friendlyMsg);
      }
    }

    if (!loggedUser) {
      const msg = 'User record not found. Please register or verify credentials.';
      showToast('warning', '❌ Sign In Failed', msg);
      throw new Error(msg);
    }

    setUser(loggedUser);
    localStorage.setItem('lifelink_user', JSON.stringify(loggedUser));
    showToast('success', '✅ Welcome Back', `Logged in as ${loggedUser.name}`);
    await reloadUsersList();
    return loggedUser;
  };

  const signup = async (userData: Partial<User> & { password?: string; email: string }): Promise<User> => {
    try {
      // 1. Create account in Firebase Auth
      const fbCred = await createUserWithEmailAndPassword(auth, userData.email.trim(), userData.password || 'temporary_pass');
      const token = await fbCred.user.getIdToken();
      setApiActor(token);

      // 2. Idempotently create/sync user record in SQLite with verified Firebase UID
      const newUser = await api.syncUser({
        ...userData,
        email: userData.email.trim(),
        firebaseUid: fbCred.user.uid,
      });

      setUser(newUser);
      localStorage.setItem('lifelink_user', JSON.stringify(newUser));
      showToast('success', '🎉 Account Created', 'Registration successful! Welcome to LifeLink.');
      await reloadUsersList();
      return newUser;
    } catch (err: any) {
      const friendlyMsg = getFriendlyErrorMessage(err);
      showToast('warning', '❌ Registration Failed', friendlyMsg);
      throw new Error(friendlyMsg);
    }
  };

  const googleSignIn = async (role?: 'Donor' | 'Patient' | 'Hospital' | 'Blood Bank'): Promise<User> => {
    try {
      const provider = new GoogleAuthProvider();
      const fbCred = await signInWithPopup(auth, provider);
      const token = await fbCred.user.getIdToken();
      setApiActor(token);

      const targetRole = role && ['Donor', 'Hospital', 'Blood Bank', 'Patient'].includes(role)
        ? (role === 'Patient' ? 'Donor' : role)
        : 'Donor';

      // Self-provision or retrieve profile from SQLite
      const sqlUser = await api.syncUser({
        firebaseUid: fbCred.user.uid,
        name: fbCred.user.displayName || 'LifeLink User',
        email: fbCred.user.email || '',
        role: targetRole,
        bloodType: targetRole === 'Donor' ? 'O+' : 'Multiple',
        location: 'Coimbatore',
        status: 'Active',
      });

      setUser(sqlUser);
      localStorage.setItem('lifelink_user', JSON.stringify(sqlUser));
      showToast('success', '✅ Google Sign-In Successful', `Welcome, ${sqlUser.name}!`);
      await reloadUsersList();
      return sqlUser;
    } catch (err: any) {
      const friendlyMsg = getFriendlyErrorMessage(err);
      showToast('warning', '❌ Google Sign-In Failed', friendlyMsg);
      throw new Error(friendlyMsg);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    setApiActor(null);
    setUser(null);
    localStorage.removeItem('lifelink_user');
    localStorage.removeItem('lifelink_token');
    showToast('info', '👋 Signed Out', 'You have been signed out successfully.');
  };

  const refreshUser = async () => {
    try {
      const profile = await api.getCurrentUser();
      setUser(profile);
      localStorage.setItem('lifelink_user', JSON.stringify(profile));
    } catch {
      await reloadUsersList();
    }
  };

  const updateUserContext = async (updateData: any) => {
    if (!user) return;
    try {
      await api.updateUser(user.id, updateData);
      await refreshUser();
    } catch (err: any) {
      showToast('warning', '❌ Update Failed', err.message || 'Could not update profile');
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || null,
        isLoggedIn: !!user,
        loading,
        logout,
        signup,
        login,
        googleSignIn,
        refreshUser,
        updateUserContext,
        usersList,
        reloadUsersList,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
