'use client';

import { Zone } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format, formatDistanceToNow } from 'date-fns';
import { toDate } from '@/lib/utils';
import { Clock, AlertTriangle, CheckCircle2, Camera } from 'lucide-react';
import { useLocale } from '@/lib/i18n/context';

interface ZoneTableProps {
  zones: Zone[];
  onZoneClick?: (zoneId: string) => void;
  showEscalateButton?: boolean;
  onEscalate?: (zoneId: string) => void;
}

type TFunc = (key: string, params?: Record<string, string | number>) => string;

function StatusBadge({ status, proofCount, requiredCount, t }: { status: string; proofCount?: number; requiredCount?: number; t: TFunc }) {
  const isGreen = status === 'GREEN';
  const colors = isGreen
    ? 'border-green-500/40 bg-green-500/12 text-green-200'
    : 'border-red-500/40 bg-red-500/12 text-red-200';

  const Icon = isGreen ? CheckCircle2 : AlertTriangle;

  return (
    <div className="flex flex-col gap-1">
      <Badge className={`${colors} font-black text-xs px-3 py-1.5 flex items-center gap-1.5 w-fit`}>
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
      {requiredCount && (
        <div className="text-xs text-gray-500 flex items-center gap-1">
          <Camera className="w-3 h-3" />
          {proofCount || 0}/{requiredCount} {t('zoneTable.proofs')}
        </div>
      )}
    </div>
  );
}

function DeadlineCell({ deadline, t }: { deadline: string | Date | null; t: TFunc }) {
  if (!deadline) {
    return <span className="text-gray-500 text-xs">{t('zoneTable.noDeadline')}</span>;
  }

  const deadlineDate = toDate(deadline);
  const now = new Date();
  const isPast = deadlineDate < now;
  const timeUntil = formatDistanceToNow(deadlineDate, { addSuffix: true });

  return (
    <div className="flex flex-col gap-0.5">
      <div className={`text-xs font-medium flex items-center gap-1.5 ${isPast ? 'text-red-400' : 'text-gray-300'}`}>
        <Clock className="w-3 h-3" />
        {format(deadlineDate, 'MMM d, HH:mm')}
      </div>
      <div className={`text-xs ${isPast ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
        {isPast ? '⚠️ ' : ''}
        {timeUntil}
      </div>
    </div>
  );
}

function EscalationBadge({ level, t }: { level: number; t: TFunc }) {
  if (level === 0) {
    return <span className="text-gray-500 text-xs">L0 — {t('zoneTable.escalationNone')}</span>;
  }

  const colors = {
    1: 'border-yellow-500/40 bg-yellow-500/12 text-yellow-200',
    2: 'border-orange-500/40 bg-orange-500/12 text-orange-200',
    3: 'border-red-500/40 bg-red-500/12 text-red-200',
  };

  const labelKeys = {
    1: 'zoneTable.escalationSite',
    2: 'zoneTable.escalationManager',
    3: 'zoneTable.escalationExecutive',
  };

  return (
    <Badge className={`${colors[level as keyof typeof colors]} text-xs px-2 py-1 font-bold flex items-center gap-1 w-fit`}>
      <span className="text-lg">⚡</span>
      L{level} — {t(labelKeys[level as keyof typeof labelKeys])}
    </Badge>
  );
}

export function ZoneTable({ zones, onZoneClick, showEscalateButton, onEscalate }: ZoneTableProps) {
  const { t } = useLocale();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">{t('zoneTable.colZone')}</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">{t('zoneTable.colDeliverable')}</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">{t('zoneTable.colOwner')}</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">{t('zoneTable.colStatus')}</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">{t('zoneTable.colDeadline')}</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">{t('zoneTable.colEscalation')}</th>
            {showEscalateButton && (
              <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">{t('zoneTable.colActions')}</th>
            )}
          </tr>
        </thead>
        <tbody>
          {zones.map((zone) => (
            <tr
              key={zone.id}
              className={`border-b border-gray-800/50 hover:bg-blue-500/5 transition-colors ${onZoneClick ? 'cursor-pointer' : ''}`}
              onClick={() => onZoneClick?.(zone.id)}
            >
              <td className="py-3 px-4">
                <div className="font-semibold text-white">{zone.name}</div>
              </td>
              <td className="py-3 px-4 text-gray-300">{zone.deliverable}</td>
              <td className="py-3 px-4 text-gray-400">{zone.owner}</td>
              <td className="py-3 px-4">
                <StatusBadge
                  status={zone.computed_status || zone.status}
                  proofCount={0}
                  requiredCount={zone.required_proof_count || 1}
                  t={t}
                />
              </td>
              <td className="py-3 px-4">
                <DeadlineCell deadline={zone.readiness_deadline} t={t} />
              </td>
              <td className="py-3 px-4">
                <EscalationBadge level={zone.current_escalation_level || 0} t={t} />
              </td>
              {showEscalateButton && (
                <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  {zone.status === 'RED' && (
                    <button
                      onClick={() => onEscalate?.(zone.id)}
                      className="px-3 py-1.5 text-xs font-bold border border-gray-700 bg-gray-800/50 hover:bg-red-500/20 hover:border-red-500 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {t('zoneTable.escalateButton')}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
