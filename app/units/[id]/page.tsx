'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Upload, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/firebase';

export default function UnitDetailPage() {
  const router = useRouter();
  const params = useParams();
  const unitId = params.id as string;
  const [unit, setUnit] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUnit();
  }, [unitId]);

  async function fetchUnit() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/units/${unitId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setUnit(data);
    } catch (error) {
      console.error('Error fetching unit:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64 bg-gray-800" />
          <Skeleton className="h-64 bg-gray-800" />
        </div>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-gray-400">Unit not found</p>
          <Button onClick={() => router.back()} className="mt-4">Go Back</Button>
        </div>
      </div>
    );
  }

  const isGreen = unit.overall_status === 'GREEN';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => router.back()}
            variant="outline"
            className="bg-black/25 border-gray-700 text-gray-300 hover:bg-black/40"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-black text-white">{unit.name}</h1>
            <p className="text-gray-500">{unit.description || 'Unit Details'}</p>
          </div>
          <Badge
            className={`${
              isGreen
                ? 'border-green-500/40 bg-green-500/12 text-green-200'
                : 'border-red-500/40 bg-red-500/12 text-red-200'
            } font-black text-sm px-4 py-2`}
          >
            {isGreen ? <CheckCircle2 className="w-4 h-4 mr-2 inline" /> : <AlertTriangle className="w-4 h-4 mr-2 inline" />}
            {unit.overall_status}
          </Badge>
        </div>

        <Card className="bg-black/25 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">Unit Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-gray-500 text-sm">Owner</span>
                <p className="text-white font-medium">{unit.owner || 'N/A'}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Deadline</span>
                <p className="text-white font-medium">
                  {unit.deadline ? format(new Date(unit.deadline), 'MMM d, yyyy HH:mm') : 'No deadline'}
                </p>
              </div>
            </div>

            {unit.last_update_time && (
              <div>
                <span className="text-gray-500 text-sm">Last Updated</span>
                <p className="text-white font-medium">
                  {format(new Date(unit.last_update_time), 'MMM d, yyyy HH:mm')}
                </p>
              </div>
            )}

            <div className="pt-4">
              <Button
                onClick={() => router.push(`/units/${unitId}/upload`)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Proof
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
