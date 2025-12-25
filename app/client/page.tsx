'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getProjects, getZonesByProject, getEscalationsByProject } from '@/lib/firestore-utils';
import { Project, Zone, Escalation } from '@/lib/types';
import { RAGCounters } from '@/components/rag-counters';
import { ZoneTable } from '@/components/zone-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toDate } from '@/lib/utils';

export default function ClientDashboard() {
  const router = useRouter();
  const { userData, loading: authLoading, signOut } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!userData || userData.role !== 'client')) {
      router.push('/');
    }
  }, [userData, authLoading, router]);

  useEffect(() => {
    async function loadData() {
      try {
        const projectsData = await getProjects();
        setProjects(projectsData);

        if (projectsData.length > 0) {
          const projectId = projectsData[0].id;
          setSelectedProject(projectId);

          const [zonesData, escalationsData] = await Promise.all([
            getZonesByProject(projectId),
            getEscalationsByProject(projectId),
          ]);

          setZones(zonesData);
          setEscalations(escalationsData);
        }
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    }

    if (userData?.role === 'client') {
      loadData();
    }
  }, [userData]);

  const handleZoneClick = (zoneId: string) => {
    router.push(`/zone/${zoneId}?view=client`);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  const project = projects.find(p => p.id === selectedProject);
  const overallStatus = zones.some(z => z.status === 'RED')
    ? 'RED'
    : zones.some(z => z.status === 'AMBER')
    ? 'AMBER'
    : 'GREEN';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0e14] via-[#121826] to-[#0b0e14]">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <span className="text-xl font-black text-black">★</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">CELESTAR PORTAL</h1>
              <p className="text-sm text-gray-400">Client Dashboard • Read-only</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge className="border-gray-700 bg-gray-800/50 text-gray-300">
              Role: CLIENT
            </Badge>
            <Badge className="border-gray-700 bg-gray-800/50 text-gray-300">
              {userData?.email}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut()}
              className="border-gray-700 bg-gray-800/50 hover:bg-gray-700"
            >
              Logout
            </Button>
          </div>
        </div>

        {project && (
          <>
            <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-white text-xl">{project.name}</CardTitle>
                    <div className="flex gap-4 mt-2 text-sm text-gray-400">
                      <span>Brand: {project.brand}</span>
                      <span>Agency: {project.agency}</span>
                      <span>Location: {project.location}</span>
                    </div>
                  </div>
                  <Badge
                    className={
                      overallStatus === 'RED'
                        ? 'border-red-500/40 bg-red-500/12 text-red-200'
                        : overallStatus === 'AMBER'
                        ? 'border-amber-500/40 bg-amber-500/12 text-amber-200'
                        : 'border-green-500/40 bg-green-500/12 text-green-200'
                    }
                  >
                    Overall: {overallStatus}
                  </Badge>
                </div>
              </CardHeader>
            </Card>

            <RAGCounters zones={zones} />

            <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
              <CardHeader>
                <CardTitle className="text-white">Zone Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ZoneTable zones={zones} onZoneClick={handleZoneClick} />
              </CardContent>
            </Card>

            {escalations.length > 0 && (
              <Card className="bg-[#121826]/90 border-[#23304a] backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-white">Recent Escalations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {escalations.map((escalation) => {
                      const zone = zones.find(z => z.id === escalation.zoneId);
                      return (
                        <div
                          key={escalation.id}
                          className="p-4 bg-black/25 border border-gray-800 rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-white">
                              {zone?.name || escalation.zoneId}
                            </span>
                            <Badge className="border-amber-500/40 bg-amber-500/12 text-amber-200">
                              {escalation.level}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-400">{escalation.note}</p>
                          <div className="mt-2 text-xs text-gray-500">
                            {format(toDate(escalation.createdAt), 'MMM d, yyyy HH:mm')} • {escalation.createdByEmail}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
