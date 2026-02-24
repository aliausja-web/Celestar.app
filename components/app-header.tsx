'use client';

import { useAuth } from '@/lib/auth-context';
import { NotificationBell } from '@/components/notification-bell';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

interface AppHeaderProps {
  /** Additional elements to render in the header (e.g. admin button, user management) */
  children?: React.ReactNode;
}

export function AppHeader({ children }: AppHeaderProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();

  if (!user) return null;

  async function handleLogout() {
    await signOut();
    router.push('/login');
  }

  return (
    <div className="flex items-center gap-3">
      <NotificationBell />
      {children}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        className="text-gray-400 hover:text-white hover:bg-gray-800"
      >
        <LogOut className="w-4 h-4 mr-2" />
        Logout
      </Button>
    </div>
  );
}
