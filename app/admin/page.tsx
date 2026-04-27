'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Users, FolderKanban, Bell, ArrowLeft, Activity, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { supabase } from '@/lib/firebase';
import { NotificationBell } from '@/components/notification-bell';
import { useLocale } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/language-switcher';

interface CronRun {
  id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'success' | 'failed';
  records_processed: number;
  error_message: string | null;
}

const JOB_LABEL_KEYS: Record<string, string> = {
  'check-escalations': 'admin.jobEscalationChecker',
  'deadline-reminders': 'admin.jobDeadlineReminders',
};

export default function AdminDashboard() {
  const router = useRouter();
  const { t } = useLocale();
  const [stats, setStats] = useState({
    totalClients: 0,
    totalUsers: 0,
    totalPrograms: 0,
    pendingNotifications: 0,
  });
  const [loading, setLoading] = useState(true);
  const [cronRuns, setCronRuns] = useState<CronRun[]>([]);
  const [cronLoading, setCronLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    fetchCronRuns();
  }, []);

  const fetchStats = async () => {
    try {
      // Get auth token for API calls
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        console.error('No auth token available');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/stats', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      } else {
        console.error('Failed to fetch stats:', await response.text());
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCronRuns = async () => {
    try {
      // Fetch latest run per job_name
      const { data, error } = await supabase
        .from('cron_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching cron runs:', error);
        setCronLoading(false);
        return;
      }

      // Keep only the most recent run per job
      const latestByJob = new Map<string, CronRun>();
      for (const run of (data || []) as CronRun[]) {
        if (!latestByJob.has(run.job_name)) {
          latestByJob.set(run.job_name, run);
        }
      }

      setCronRuns(Array.from(latestByJob.values()));
    } catch (error) {
      console.error('Error fetching cron runs:', error);
    } finally {
      setCronLoading(false);
    }
  };

  const cards = [
    {
      title: t('admin.clients'),
      value: stats.totalClients,
      icon: Building2,
      iconColor: 'text-[#58a6ff]/70',
      bgColor: 'bg-[#58a6ff]/10',
      link: '/admin/clients',
      description: t('admin.clientsDesc'),
    },
    {
      title: t('admin.users'),
      value: stats.totalUsers,
      icon: Users,
      iconColor: 'text-[#3fb950]/70',
      bgColor: 'bg-[#3fb950]/10',
      link: '/admin/users',
      description: t('admin.usersDesc'),
    },
    {
      title: t('admin.programs'),
      value: stats.totalPrograms,
      icon: FolderKanban,
      iconColor: 'text-[#a371f7]/70',
      bgColor: 'bg-[#a371f7]/10',
      link: '/admin/programs',
      description: t('admin.programsDesc'),
    },
    {
      title: t('admin.notificationsLabel'),
      value: stats.pendingNotifications,
      icon: Bell,
      iconColor: 'text-[#db6d28]/70',
      bgColor: 'bg-[#db6d28]/10',
      link: '/admin/notifications',
      description: t('admin.notificationsDesc'),
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E1116] flex items-center justify-center">
        <div className="text-[#e6edf3]">{t('admin.loadingDashboard')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E1116]">
      {/* Header */}
      <div className="border-b border-[#30363d] bg-[#161b22]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Celestar Logo */}
              <div className="w-10 h-10 rounded bg-[#1a1f26] flex items-center justify-center border border-[#21262d]">
                <div className="grid grid-cols-2 gap-0.5 w-6 h-6">
                  <div className="bg-red-500/70 rounded-tl"></div>
                  <div className="bg-orange-500/70 rounded-tr"></div>
                  <div className="bg-green-500/70 rounded-bl"></div>
                  <div className="bg-blue-500/70 rounded-br"></div>
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-[#e6edf3] mb-1">{t('admin.title')}</h1>
                <p className="text-[#7d8590] text-sm">{t('admin.subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <NotificationBell />
              <button
                onClick={() => router.push('/programs')}
                className="flex items-center gap-2 px-4 py-2 bg-[#1f2937] hover:bg-[#374151] text-[#e6edf3] rounded border border-[#30363d] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('admin.backToPrograms')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.link}
                onClick={() => router.push(card.link)}
                className="group bg-[#161b22] rounded border border-[#30363d] hover:border-[#58a6ff]/30 p-6 transition-all duration-200 shadow-sm text-left"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded ${card.bgColor} border border-[#30363d]`}>
                    <Icon className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                </div>

                <div className="text-left">
                  <p className="text-[#7d8590] text-sm mb-1">{card.title}</p>
                  <p className="text-2xl font-medium text-[#e6edf3] mb-2">{card.value}</p>
                  <p className="text-[#7d8590] text-xs">{card.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="bg-[#161b22] rounded border border-[#30363d] p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-medium text-[#e6edf3] mb-4">{t('admin.quickActions')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/admin/clients?action=create')}
              className="p-4 bg-[#58a6ff]/10 hover:bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#e6edf3] rounded transition-colors text-start"
            >
              <Building2 className="w-5 h-5 mb-2 text-[#58a6ff]/70" />
              <p className="font-medium">{t('admin.addNewClient')}</p>
              <p className="text-sm text-[#7d8590] mt-1">{t('admin.addNewClientDesc')}</p>
            </button>

            <button
              onClick={() => router.push('/admin/users?action=create')}
              className="p-4 bg-[#3fb950]/10 hover:bg-[#3fb950]/15 border border-[#3fb950]/30 text-[#e6edf3] rounded transition-colors text-start"
            >
              <Users className="w-5 h-5 mb-2 text-[#3fb950]/70" />
              <p className="font-medium">{t('admin.addNewUser')}</p>
              <p className="text-sm text-[#7d8590] mt-1">{t('admin.addNewUserDesc')}</p>
            </button>

            <button
              onClick={() => router.push('/admin/programs')}
              className="p-4 bg-[#a371f7]/10 hover:bg-[#a371f7]/15 border border-[#a371f7]/30 text-[#e6edf3] rounded transition-colors text-start"
            >
              <FolderKanban className="w-5 h-5 mb-2 text-[#a371f7]/70" />
              <p className="font-medium">{t('admin.assignPrograms')}</p>
              <p className="text-sm text-[#7d8590] mt-1">{t('admin.assignProgramsDesc')}</p>
            </button>
          </div>
        </div>

        {/* System Health */}
        <div className="bg-[#161b22] rounded border border-[#30363d] p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-[#7d8590]" />
            <h2 className="text-lg font-medium text-[#e6edf3]">{t('admin.systemHealth')}</h2>
          </div>

          {cronLoading ? (
            <p className="text-[#7d8590] text-sm">{t('admin.loadingCron')}</p>
          ) : cronRuns.length === 0 ? (
            <p className="text-[#7d8590] text-sm italic">{t('admin.noCronRuns')}</p>
          ) : (
            <div className="divide-y divide-[#21262d]">
              {cronRuns.map((run) => {
                const labelKey = JOB_LABEL_KEYS[run.job_name];
                const label = labelKey ? t(labelKey) : run.job_name;
                const lastRunAt = run.completed_at ?? run.started_at;

                return (
                  <div key={run.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {run.status === 'success' && (
                          <CheckCircle2 className="w-4 h-4 text-[#3fb950] flex-shrink-0 mt-0.5" />
                        )}
                        {run.status === 'failed' && (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        {run.status === 'running' && (
                          <Clock className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5 animate-pulse" />
                        )}
                        <div className="min-w-0">
                          <p className="text-[#e6edf3] text-sm font-medium">{label}</p>
                          {run.status === 'failed' && run.error_message && (
                            <p className="text-red-400 text-xs mt-0.5 truncate">{run.error_message}</p>
                          )}
                          {run.status === 'success' && (
                            <p className="text-[#7d8590] text-xs mt-0.5">
                              {t('admin.recordsProcessed', { count: run.records_processed })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                            run.status === 'success'
                              ? 'text-[#3fb950] bg-[#3fb950]/10 border-[#3fb950]/30'
                              : run.status === 'failed'
                              ? 'text-red-400 bg-red-400/10 border-red-400/30'
                              : 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30'
                          }`}
                        >
                          {run.status.toUpperCase()}
                        </span>
                        <span className="text-[#7d8590] text-xs">{(() => {
                          const date = new Date(lastRunAt);
                          if (isNaN(date.getTime())) return t('admin.justNow');
                          const diffMs = Date.now() - date.getTime();
                          const diffMins = Math.floor(diffMs / 60000);
                          const diffHours = Math.floor(diffMins / 60);
                          const diffDays = Math.floor(diffHours / 24);
                          if (diffMins < 1) return t('admin.justNow');
                          if (diffMins < 60) return t('admin.minsAgo', { n: diffMins });
                          if (diffHours < 24) return t('admin.hoursAgo', { n: diffHours });
                          return t('admin.daysAgo', { n: diffDays });
                        })()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
