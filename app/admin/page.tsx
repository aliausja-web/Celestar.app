'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Users, FolderKanban, Bell, ArrowLeft } from 'lucide-react';

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalClients: 0,
    totalUsers: 0,
    totalPrograms: 0,
    pendingNotifications: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      } else {
        console.error('Failed to fetch stats');
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const cards = [
    {
      title: 'Client Organizations',
      value: stats.totalClients,
      icon: Building2,
      iconColor: 'text-[#58a6ff]/70',
      bgColor: 'bg-[#58a6ff]/10',
      link: '/admin/clients',
      description: 'Manage client organizations',
    },
    {
      title: 'Users',
      value: stats.totalUsers,
      icon: Users,
      iconColor: 'text-[#3fb950]/70',
      bgColor: 'bg-[#3fb950]/10',
      link: '/admin/users',
      description: 'Manage user accounts',
    },
    {
      title: 'Programs',
      value: stats.totalPrograms,
      icon: FolderKanban,
      iconColor: 'text-[#a371f7]/70',
      bgColor: 'bg-[#a371f7]/10',
      link: '/admin/programs',
      description: 'Assign programs to clients',
    },
    {
      title: 'Notifications',
      value: stats.pendingNotifications,
      icon: Bell,
      iconColor: 'text-[#db6d28]/70',
      bgColor: 'bg-[#db6d28]/10',
      link: '/admin/notifications',
      description: 'System notifications',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E1116] flex items-center justify-center">
        <div className="text-[#e6edf3]">Loading dashboard...</div>
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
                <h1 className="text-2xl font-semibold text-[#e6edf3] mb-1">Admin Dashboard</h1>
                <p className="text-[#7d8590] text-sm">Platform administration and client management</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/programs')}
              className="flex items-center gap-2 px-4 py-2 bg-[#1f2937] hover:bg-[#374151] text-[#e6edf3] rounded border border-[#30363d] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Programs
            </button>
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
          <h2 className="text-lg font-medium text-[#e6edf3] mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/admin/clients?action=create')}
              className="p-4 bg-[#58a6ff]/10 hover:bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#e6edf3] rounded transition-colors text-left"
            >
              <Building2 className="w-5 h-5 mb-2 text-[#58a6ff]/70" />
              <p className="font-medium">Add New Client</p>
              <p className="text-sm text-[#7d8590] mt-1">Create a new client organization</p>
            </button>

            <button
              onClick={() => router.push('/admin/users?action=create')}
              className="p-4 bg-[#3fb950]/10 hover:bg-[#3fb950]/15 border border-[#3fb950]/30 text-[#e6edf3] rounded transition-colors text-left"
            >
              <Users className="w-5 h-5 mb-2 text-[#3fb950]/70" />
              <p className="font-medium">Add New User</p>
              <p className="text-sm text-[#7d8590] mt-1">Create a user and assign to client</p>
            </button>

            <button
              onClick={() => router.push('/admin/programs')}
              className="p-4 bg-[#a371f7]/10 hover:bg-[#a371f7]/15 border border-[#a371f7]/30 text-[#e6edf3] rounded transition-colors text-left"
            >
              <FolderKanban className="w-5 h-5 mb-2 text-[#a371f7]/70" />
              <p className="font-medium">Assign Programs</p>
              <p className="text-sm text-[#7d8590] mt-1">Link programs to clients</p>
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-[#161b22] border border-[#30363d] rounded p-6 shadow-sm">
          <h3 className="text-[#e6edf3] font-medium mb-2 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#58a6ff]/70" />
            Multi-Client Management
          </h3>
          <p className="text-[#7d8590] text-sm leading-relaxed">
            This admin dashboard allows you to onboard unlimited clients. Each client organization has its own isolated data, users, and programs.
            Users automatically see only their client's data when they log in. No SQL commands needed - everything is managed through this interface.
          </p>
        </div>
      </div>
    </div>
  );
}
