'use client';

import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, AlertOctagon, CheckCircle2, XCircle, Clock, Paperclip, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/lib/i18n/context';
import { getNotifContent, formatRelativeTimeI18n } from '@/lib/i18n/notifications';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  is_read: boolean;
  created_at: string;
  action_url: string | null;
}

export function NotificationBell() {
  const router = useRouter();
  const { t } = useLocale();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();

    // Set up real-time subscription
    const channel = supabase
      .channel('in_app_notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'in_app_notifications',
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchNotifications() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.is_read).length || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(notificationId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = session.access_token;

      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async function handleNotificationClick(notification: Notification) {
    await markAsRead(notification.id);

    if (notification.action_url) {
      router.push(notification.action_url);
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'normal':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case 'escalation':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'manual_escalation':
        return <AlertOctagon className="w-4 h-4 text-red-400" />;
      case 'proof_approved':
        return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'proof_rejected':
        return <XCircle className="w-4 h-4 text-red-400" />;
      case 'proof_submitted':
        return <Paperclip className="w-4 h-4 text-blue-400" />;
      case 'deadline_approaching':
        return <Clock className="w-4 h-4 text-orange-400" />;
      default:
        return <Megaphone className="w-4 h-4 text-gray-400" />;
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 px-1.5 py-0.5 text-xs bg-red-500 text-white border-none min-w-[20px] h-5 flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-96 bg-gray-950 border-gray-800 max-h-[500px] overflow-y-auto"
      >
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="font-semibold text-white">{t('notificationBell.title')}</h3>
          <p className="text-xs text-gray-400">
            {unreadCount > 0 ? t('notificationBell.unread', { count: unreadCount }) : t('notificationBell.allCaughtUp')}
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-500">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('notificationBell.loading')}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t('notificationBell.noNotifications')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`px-4 py-3 cursor-pointer focus:bg-gray-900 ${
                  !notification.is_read ? 'bg-gray-900/50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex gap-3 w-full">
                  <div className="flex-shrink-0 mt-1">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        !notification.is_read ? getPriorityColor(notification.priority) : 'bg-gray-700'
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    {(() => {
                      const content = getNotifContent(notification, t);
                      return (
                        <>
                          <div className="flex items-start gap-2 mb-1">
                            <span className="shrink-0 mt-0.5">{getTypeIcon(notification.type)}</span>
                            <p className="text-sm font-medium text-white truncate flex-1">
                              {content.title}
                            </p>
                          </div>
                          <p className="text-xs text-gray-400 line-clamp-2">
                            {content.message}
                          </p>
                        </>
                      );
                    })()}
                    <p className="text-xs text-gray-500 mt-1">
                      {notification.created_at
                        ? formatRelativeTimeI18n(notification.created_at, t)
                        : t('admin.justNow')}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        )}

        {notifications.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-800">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-900"
              onClick={() => router.push('/notifications')}
            >
              {t('notificationBell.viewAll')}
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
