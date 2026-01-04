'use client';

// Root page - redirects based on auth state
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/firebase';

export default function Home() {
  const router = useRouter();
  const { user, userData, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
      } else if (userData) {
        if (userData.role === 'admin') {
          router.push('/admin');
        } else if (userData.role === 'supervisor') {
          router.push('/supervisor');
        } else if (userData.role === 'client') {
          router.push('/client');
        }
      } else if (user && !userData) {
        // User is authenticated but has no user data - sign them out and redirect to login
        console.error('User authenticated but no user data found. Signing out...');
        supabase.auth.signOut().then(() => {
          router.push('/login');
        });
      }
    }
  }, [user, userData, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}
