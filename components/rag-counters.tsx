import { Zone } from '@/lib/types';
import { Card } from '@/components/ui/card';

interface RAGCountersProps {
  zones: Zone[];
}

export function RAGCounters({ zones }: RAGCountersProps) {
  const redCount = zones.filter(z => z.status === 'RED').length;
  const amberCount = zones.filter(z => z.status === 'AMBER').length;
  const greenCount = zones.filter(z => z.status === 'GREEN').length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-gradient-to-br from-[#121826]/95 to-[#0f1522]/95 border-[#23304a] p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-400">Red</div>
            <div className="text-3xl font-black text-[#ff4d4f]">{redCount}</div>
            <div className="text-xs text-gray-500 mt-1">Unverified / failing</div>
          </div>
          <div className="w-3 h-3 rounded-full bg-[#ff4d4f] shadow-lg shadow-red-500/50"></div>
        </div>
      </Card>

      <Card className="bg-gradient-to-br from-[#121826]/95 to-[#0f1522]/95 border-[#23304a] p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-400">Amber</div>
            <div className="text-3xl font-black text-[#f6c343]">{amberCount}</div>
            <div className="text-xs text-gray-500 mt-1">Partially verified</div>
          </div>
          <div className="w-3 h-3 rounded-full bg-[#f6c343] shadow-lg shadow-amber-500/50"></div>
        </div>
      </Card>

      <Card className="bg-gradient-to-br from-[#121826]/95 to-[#0f1522]/95 border-[#23304a] p-4 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-400">Green</div>
            <div className="text-3xl font-black text-[#2ecc71]">{greenCount}</div>
            <div className="text-xs text-gray-500 mt-1">Verified with proof</div>
          </div>
          <div className="w-3 h-3 rounded-full bg-[#2ecc71] shadow-lg shadow-green-500/50"></div>
        </div>
      </Card>
    </div>
  );
}
