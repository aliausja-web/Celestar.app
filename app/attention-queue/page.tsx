'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NotificationBell } from '@/components/notification-bell';
import { useLocale } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/language-switcher';

interface AttentionItem {
  type: 'proof_pending' | 'unit_at_risk' | 'unit_blocked' | 'manual_escalation';
  priority: number;
  id: string;
  unit_id: string;
  unit_title: string;
  program_name: string;
  workstream_name: string;
  details: any;
  deadline?: string;
  hours_until_deadline?: number;
  action_url: string;
}

interface AttentionQueueData {
  summary: {
    total_items: number;
    pending_proofs: number;
    units_at_risk: number;
    units_blocked: number;
    manual_escalations: number;
  };
  items: AttentionItem[];
  user_role: string;
}

export default function AttentionQueue() {
  const router = useRouter();
  const { t } = useLocale();
  const [data, setData] = useState<AttentionQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAttentionQueue();
  }, []);

  const fetchAttentionQueue = async () => {
    try {
      const response = await fetch('/api/attention-queue');
      if (!response.ok) {
        throw new Error('Failed to fetch attention queue');
      }
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-8 flex items-center justify-center">
        <div className="text-gray-400">{t('attentionQueue.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] p-8 flex items-center justify-center">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  const { summary, items } = data!;

  return (
    <div className="min-h-screen bg-[#0a0a0a] p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{t('attentionQueue.title')}</h1>
            <p className="text-gray-400">{t('attentionQueue.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <NotificationBell />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <SummaryCard
            title={t('attentionQueue.pendingProofs')}
            count={summary.pending_proofs}
            color="blue"
          />
          <SummaryCard
            title={t('attentionQueue.unitsAtRisk')}
            count={summary.units_at_risk}
            color="orange"
          />
          <SummaryCard
            title={t('attentionQueue.unitsBlocked')}
            count={summary.units_blocked}
            color="red"
          />
          <SummaryCard
            title={t('attentionQueue.manualEscalations')}
            count={summary.manual_escalations}
            color="purple"
          />
        </div>

        {/* Items List */}
        {items.length === 0 ? (
          <div className="bg-[#1a1a1a] border border-gray-800 rounded-lg p-12 text-center">
            <div className="text-gray-500 text-lg mb-2">{t('attentionQueue.allClear')}</div>
            <div className="text-gray-600">{t('attentionQueue.noItems')}</div>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <AttentionItemCard
                key={item.id}
                item={item}
                onClick={() => router.push(item.action_url)}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  count,
  color,
}: {
  title: string;
  count: number;
  color: 'blue' | 'orange' | 'red' | 'purple';
}) {
  const colors = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  };

  return (
    <div className={`border rounded-lg p-4 ${colors[color]}`}>
      <div className="text-sm opacity-80 mb-1">{title}</div>
      <div className="text-3xl font-bold">{count}</div>
    </div>
  );
}

function AttentionItemCard({
  item,
  onClick,
  t,
}: {
  item: AttentionItem;
  onClick: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const typeConfig = {
    proof_pending: {
      icon: '📝',
      label: t('attentionQueue.proofPendingLabel'),
      color: 'border-blue-500/30 hover:border-blue-500/50',
    },
    unit_at_risk: {
      icon: '⚠️',
      label: t('attentionQueue.unitAtRiskLabel'),
      color: 'border-orange-500/30 hover:border-orange-500/50',
    },
    unit_blocked: {
      icon: '🚫',
      label: t('attentionQueue.unitBlockedLabel'),
      color: 'border-red-500/30 hover:border-red-500/50',
    },
    manual_escalation: {
      icon: '🚨',
      label: t('attentionQueue.manualEscalationLabel'),
      color: 'border-purple-500/30 hover:border-purple-500/50',
    },
  };

  const config = typeConfig[item.type];

  return (
    <button
      onClick={onClick}
      className={`w-full bg-[#1a1a1a] border ${config.color} rounded-lg p-4 text-start transition-all hover:bg-[#222]`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Type and Priority */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{config.icon}</span>
            <div>
              <div className="text-sm text-gray-400">{config.label}</div>
              <div className="text-white font-medium">{item.unit_title}</div>
            </div>
          </div>

          {/* Program / Workstream */}
          <div className="text-sm text-gray-500 mb-2">
            {item.program_name} → {item.workstream_name}
          </div>

          {/* Details */}
          <div className="text-sm text-gray-400">
            {item.type === 'proof_pending' && (
              <div>
                {t('attentionQueue.uploadedBy')} {item.details.uploaded_by} •{' '}
                {item.details.proof_type}
                {item.details.high_criticality && (
                  <span className="ms-2 text-red-400">{t('attentionQueue.highCriticality')}</span>
                )}
              </div>
            )}
            {item.type === 'unit_at_risk' && (
              <div>
                {t('attentionQueue.escalationLevel')} {item.details.escalation_level} •{' '}
                {item.hours_until_deadline && item.hours_until_deadline < 0
                  ? t('attentionQueue.hoursOverdue').replace('{h}', String(Math.abs(Math.round(item.hours_until_deadline))))
                  : t('attentionQueue.hoursRemaining').replace('{h}', String(Math.round(item.hours_until_deadline || 0)))}
              </div>
            )}
            {item.type === 'unit_blocked' && (
              <div className="text-red-400">{item.details.blocked_reason}</div>
            )}
            {item.type === 'manual_escalation' && (
              <div>
                Level {item.details.escalation_level} • {item.details.reason} •{' '}
                {item.details.age_hours}h ago
              </div>
            )}
          </div>
        </div>

        {/* Deadline Badge */}
        {item.hours_until_deadline !== null &&
          item.hours_until_deadline !== undefined && (
            <div
              className={`px-3 py-1 rounded text-sm font-medium ${
                item.hours_until_deadline < 0
                  ? 'bg-red-500/20 text-red-400'
                  : item.hours_until_deadline < 24
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'bg-gray-500/20 text-gray-400'
              }`}
            >
              {item.hours_until_deadline < 0
                ? t('attentionQueue.hPast').replace('{h}', String(Math.abs(Math.round(item.hours_until_deadline))))
                : t('attentionQueue.hLeft').replace('{h}', String(Math.round(item.hours_until_deadline)))}
            </div>
          )}
      </div>
    </button>
  );
}
