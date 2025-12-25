'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

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
      }
    }
  }, [user, userData, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}
