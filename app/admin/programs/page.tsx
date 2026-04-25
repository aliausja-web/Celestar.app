'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderKanban, ArrowLeft, Building2, Link as LinkIcon, Unlink } from 'lucide-react';
import { supabase } from '@/lib/firebase';
import { useLocale } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/language-switcher';

interface Program {
  id: string;
  name: string;
  description?: string;
  client_organization_id?: string;
  organization_name?: string;
  created_at: string;
}

interface Organization {
  id: string;
  name: string;
  client_code: string;
}

export default function ProgramsManagement() {
  const router = useRouter();
  const { t } = useLocale();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [selectedOrganization, setSelectedOrganization] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // Fetch programs
      const programsRes = await fetch('/api/admin/programs', { headers });
      if (programsRes.ok) {
        const programsData = await programsRes.json();
        setPrograms(programsData.programs || []);
      }

      // Fetch organizations
      const orgsRes = await fetch('/api/admin/organizations', { headers });
      if (orgsRes.ok) {
        const orgsData = await orgsRes.json();
        setOrganizations(orgsData.organizations || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedProgram || !selectedOrganization) {
      alert(t('adminPrograms.selectBothError'));
      return;
    }

    setAssigning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/admin/programs/${selectedProgram}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ organization_id: selectedOrganization }),
      });

      if (response.ok) {
        await fetchData();
        setSelectedProgram(null);
        setSelectedOrganization('');
        alert(t('adminPrograms.assignSuccess'));
      } else {
        const error = await response.json();
        alert(error.error || t('adminPrograms.assignFailed'));
      }
    } catch (error) {
      console.error('Error assigning program:', error);
      alert(t('adminPrograms.assignFailed'));
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async (programId: string, programName: string) => {
    if (!confirm(t('adminPrograms.unassignConfirm').replace('{name}', programName))) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`/api/admin/programs/${programId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
        },
        body: JSON.stringify({ organization_id: null }),
      });

      if (response.ok) {
        await fetchData();
        alert(t('adminPrograms.unassignSuccess'));
      } else {
        alert(t('adminPrograms.unassignFailed'));
      }
    } catch (error) {
      console.error('Error unassigning program:', error);
      alert(t('adminPrograms.unassignFailed'));
    }
  };

  const unassignedPrograms = programs.filter((p) => !p.client_organization_id);
  const assignedPrograms = programs.filter((p) => p.client_organization_id);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-white">{t('adminPrograms.loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/admin')}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
              </button>
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">{t('adminPrograms.title')}</h1>
                <p className="text-gray-400">{t('adminPrograms.subtitle')}</p>
              </div>
            </div>
            <LanguageSwitcher />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {programs.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-12 border border-gray-700 text-center">
            <FolderKanban className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">{t('adminPrograms.noPrograms')}</h3>
            <p className="text-gray-400 mb-6">{t('adminPrograms.noProgramsDesc')}</p>
            <button
              onClick={() => router.push('/programs')}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
            >
              {t('adminPrograms.goToPrograms')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Assign Section */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-purple-400" />
                {t('adminPrograms.assignTitle')}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    {t('adminPrograms.selectProgram')}
                  </label>
                  <select
                    value={selectedProgram || ''}
                    onChange={(e) => setSelectedProgram(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">{t('adminPrograms.chooseProgram')}</option>
                    {unassignedPrograms.map((program) => (
                      <option key={program.id} value={program.id}>
                        {program.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-gray-500 text-xs mt-1">
                    {t('adminPrograms.unassignedCount', { count: unassignedPrograms.length })}
                  </p>
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    {t('adminPrograms.selectOrg')}
                  </label>
                  <select
                    value={selectedOrganization}
                    onChange={(e) => setSelectedOrganization(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">{t('adminPrograms.chooseOrg')}</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.client_code})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleAssign}
                  disabled={assigning || !selectedProgram || !selectedOrganization}
                  className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  {assigning ? t('adminPrograms.assigning') : t('adminPrograms.assignButton')}
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-700">
                <p className="text-gray-400 text-sm leading-relaxed">
                  {t('adminPrograms.assignInfo')}
                </p>
              </div>
            </div>

            {/* Assigned Programs List */}
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">{t('adminPrograms.assignedTitle')}</h2>

              {assignedPrograms.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 text-sm">{t('adminPrograms.noAssigned')}</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {assignedPrograms.map((program) => (
                    <div
                      key={program.id}
                      className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <FolderKanban className="w-4 h-4 text-purple-400" />
                            <h3 className="text-white font-medium">{program.name}</h3>
                          </div>
                          {program.description && (
                            <p className="text-gray-400 text-sm mb-2">{program.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <Building2 className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-300 text-sm">{program.organization_name}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnassign(program.id, program.name)}
                          className="p-2 hover:bg-red-500/10 rounded-lg text-red-400 hover:text-red-300 transition-colors flex-shrink-0"
                          title="Unassign"
                        >
                          <Unlink className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-800/30 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-purple-400" />
            {t('adminPrograms.howItWorks')}
          </h3>
          <ul className="text-gray-300 text-sm leading-relaxed space-y-2">
            <li>• {t('adminPrograms.howItWorks1')}</li>
            <li>• {t('adminPrograms.howItWorks2')}</li>
            <li>• {t('adminPrograms.howItWorks3')}</li>
            <li>• {t('adminPrograms.howItWorks4')}</li>
            <li>• {t('adminPrograms.howItWorks5')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
