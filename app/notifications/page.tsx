'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, ArrowLeft, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/firebase';
import { formatDistanceToNow } from 'date-fns';

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

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel('notifications_page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'in_app_notifications' },
        () => fetchNotifications()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchNotifications() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const query = supabase
        .from('in_app_notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      const { data, error } = await query;
      if (error) throw error;
      setNotifications(data || []);
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

      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async function markAllAsRead() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const unread = notifications.filter(n => !n.is_read);
      for (const n of unread) {
        await fetch(`/api/notifications/${n.id}/read`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
      }
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }

  function handleNotificationClick(notification: Notification) {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'normal': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  }

  function getPriorityLabel(priority: string) {
    switch (priority) {
      case 'critical': return 'border-red-500/50 bg-red-500/10 text-red-400';
      case 'high': return 'border-orange-500/50 bg-orange-500/10 text-orange-400';
      case 'normal': return 'border-blue-500/50 bg-blue-500/10 text-blue-400';
      default: return 'border-gray-500/50 bg-gray-500/10 text-gray-400';
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case 'escalation': return '⚠️';
      case 'manual_escalation': return '🚨';
      case 'proof_approved': return '✅';
      case 'proof_rejected': return '❌';
      case 'deadline_approaching': return '⏰';
      case 'status_change': return '🔄';
      default: return '📢';
    }
  }

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen bg-[#0E1116] p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/programs')}
              className="text-[#7d8590] hover:text-[#e6edf3]"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold text-[#e6edf3]">Notifications</h1>
              <p className="text-sm text-[#7d8590]">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={markAllAsRead}
                className="text-gray-400 border-gray-700 hover:text-white hover:bg-gray-800"
              >
                <CheckCheck className="w-4 h-4 mr-2" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}
          >
            All ({notifications.length})
          </Button>
          <Button
            variant={filter === 'unread' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setFilter('unread')}
            className={filter === 'unread' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'}
          >
            Unread ({unreadCount})
          </Button>
        </div>

        {/* Notification List */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">
            <Bell className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Bell className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                  !notification.is_read
                    ? 'bg-[#161b22] border-[#30363d] hover:bg-[#1c2128]'
                    : 'bg-[#0d1117] border-[#21262d] hover:bg-[#161b22]'
                }`}
              >
                {/* Priority dot */}
                <div className="flex-shrink-0 mt-1.5">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      !notification.is_read ? getPriorityColor(notification.priority) : 'bg-gray-700'
                    }`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{getTypeIcon(notification.type)}</span>
                    <p className={`font-medium truncate ${!notification.is_read ? 'text-white' : 'text-gray-400'}`}>
                      {notification.title}
                    </p>
                    <Badge className={`text-xs ${getPriorityLabel(notification.priority)}`}>
                      {notification.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-[#7d8590] line-clamp-2 mb-1">
                    {notification.message}
                  </p>
                  <p className="text-xs text-[#484f58]">
                    {notification.created_at && !isNaN(new Date(notification.created_at).getTime())
                      ? formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })
                      : 'Just now'}
                  </p>
                </div>

                {/* Mark as read button */}
                {!notification.is_read && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      markAsRead(notification.id);
                    }}
                    className="flex-shrink-0 text-gray-500 hover:text-white hover:bg-gray-800"
                    title="Mark as read"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
