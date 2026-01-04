'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './firebase';
import { User, UserRole } from './types';

interface AuthContextType {
  user: any | null;
  userData: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  createUser: (email: string, password: string, role: UserRole, orgId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserData = async (userId: string) => {
    // Get the user's email from the auth session
    const { data: { session } } = await supabase.auth.getSession();
    const userEmail = session?.user?.email;

    if (!userEmail) {
      console.error('No user email found in session');
      setLoading(false);
      return;
    }

    console.log('Loading user data for:', userEmail);

    // Fetch user by email since UID comparison is failing
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', userEmail)
      .maybeSingle();

    if (error) {
      console.error('Error fetching user data:', error);
    }

    if (data) {
      console.log('User data loaded:', { email: data.email, role: data.role });
      setUserData(data as User);
    } else {
      console.error('No user record found in users table for:', userEmail);
      console.error('This user exists in Supabase Auth but not in the users table.');
      console.error('Please ensure the user is created through the admin panel or has a corresponding record in the users table.');
    }
    setLoading(false);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const createUser = async (email: string, password: string, role: UserRole, orgId: string) => {
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;

    if (authData.user) {
      const newUser: User = {
        uid: authData.user.id,
        email,
        role,
        org_id: orgId,
        created_at: new Date() as any,
      };
      const { error: dbError } = await supabase.from('users').insert([newUser]);
      if (dbError) throw dbError;
    }
  };

  const value = {
    user,
    userData,
    loading,
    signIn,
    signOut,
    createUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
