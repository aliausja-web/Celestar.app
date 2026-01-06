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

    // RBAC: Fetch user from profiles table by user_id
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching profile data:', error);
    }

    if (data) {
      console.log('Profile data loaded:', { email: data.email, role: data.role });
      // Map profile data to User type for backwards compatibility
      setUserData({
        uid: data.user_id,
        email: data.email,
        role: data.role.toLowerCase(), // Convert PLATFORM_ADMIN -> platform_admin for routing
        org_id: data.org_id,
        created_at: data.created_at,
        full_name: data.full_name,
      } as any);
    } else {
      console.error('No profile record found for user ID:', userId);
      console.error('This user exists in Supabase Auth but not in the profiles table.');
      console.error('Please ensure the user has a profile record created.');
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
      // RBAC: Insert into profiles table instead of users table
      const { error: dbError } = await supabase.from('profiles').insert([{
        user_id: authData.user.id,
        email,
        role: role.toUpperCase(), // Convert to RBAC format (e.g., admin -> PLATFORM_ADMIN)
        org_id: orgId,
        full_name: email.split('@')[0], // Default full name from email
      }]);
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
