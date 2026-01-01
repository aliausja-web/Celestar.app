import { Zone } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toDate } from '@/lib/utils';

interface ZoneTableProps {
  zones: Zone[];
  onZoneClick?: (zoneId: string) => void;
  showEscalateButton?: boolean;
  onEscalate?: (zoneId: string) => void;
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    RED: 'border-red-500/40 bg-red-500/12 text-red-200',
    GREEN: 'border-green-500/40 bg-green-500/12 text-green-200',
  };

  const dotColors = {
    RED: 'bg-red-500',
    GREEN: 'bg-green-500',
  };

  return (
    <Badge className={`${colors[status as keyof typeof colors]} font-black text-xs px-3 py-1`}>
      <span className={`inline-block w-2 h-2 rounded-full mr-2 ${dotColors[status as keyof typeof dotColors]}`}></span>
      {status}
    </Badge>
  );
}

export function ZoneTable({ zones, onZoneClick, showEscalateButton, onEscalate }: ZoneTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Zone</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Deliverable</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Owner</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Status</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Last Verified</th>
            <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Escalation</th>
            {showEscalateButton && (
              <th className="text-left py-3 px-4 text-gray-400 font-bold text-xs">Actions</th>
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
                <StatusBadge status={zone.status} />
              </td>
              <td className="py-3 px-4 text-gray-400">
                {zone.lastVerifiedAt
                  ? format(toDate(zone.lastVerifiedAt), 'MMM d, HH:mm')
                  : '—'}
              </td>
              <td className="py-3 px-4">
                {zone.isEscalated ? (
                  <Badge className="border-amber-500/40 bg-amber-500/12 text-amber-200 text-xs">
                    ⚠ {zone.escalationLevel}
                  </Badge>
                ) : (
                  <span className="text-gray-500 text-xs">—</span>
                )}
              </td>
              {showEscalateButton && (
                <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                  {zone.status === 'RED' && (
                    <button
                      onClick={() => onEscalate?.(zone.id)}
                      className="px-3 py-1 text-xs font-bold border border-gray-700 bg-gray-800/50 hover:bg-red-500/20 hover:border-red-500 rounded-lg transition-colors"
                    >
                      Escalate
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
