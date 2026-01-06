'use client';

// Root page - redirects to login
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Always redirect to login page
    // Login page will handle routing authenticated users to the appropriate page
    router.replace('/login');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#0b0f14] via-[#121b26] to-[#0b0f14]">
      <div className="animate-pulse text-gray-400">Redirecting to login...</div>
    </div>
  );
}
