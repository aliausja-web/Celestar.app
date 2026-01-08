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

  useEffect(() => {
    // TODO: Fetch actual stats from API
    setStats({
      totalClients: 2,
      totalUsers: 6,
      totalPrograms: 4,
      pendingNotifications: 0,
    });
  }, []);

  const cards = [
    {
      title: 'Client Organizations',
      value: stats.totalClients,
      icon: Building2,
      color: 'from-blue-500 to-blue-600',
      link: '/admin/clients',
      description: 'Manage client organizations',
    },
    {
      title: 'Users',
      value: stats.totalUsers,
      icon: Users,
      color: 'from-green-500 to-green-600',
      link: '/admin/users',
      description: 'Manage user accounts',
    },
    {
      title: 'Programs',
      value: stats.totalPrograms,
      icon: FolderKanban,
      color: 'from-purple-500 to-purple-600',
      link: '/admin/programs',
      description: 'Assign programs to clients',
    },
    {
      title: 'Notifications',
      value: stats.pendingNotifications,
      icon: Bell,
      color: 'from-orange-500 to-orange-600',
      link: '/admin/notifications',
      description: 'System notifications',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-800/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
              <p className="text-gray-400">Platform administration and client management</p>
            </div>
            <button
              onClick={() => router.push('/programs')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
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
                className="group relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-all duration-200 hover:shadow-xl hover:scale-105 text-left"
              >
                {/* Gradient overlay */}
                <div className={`absolute inset-0 bg-gradient-to-br ${card.color} opacity-0 group-hover:opacity-10 rounded-xl transition-opacity`}></div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-lg bg-gradient-to-br ${card.color}`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  </div>

                  <div className="text-left">
                    <p className="text-gray-400 text-sm mb-1">{card.title}</p>
                    <p className="text-3xl font-bold text-white mb-2">{card.value}</p>
                    <p className="text-gray-500 text-xs">{card.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push('/admin/clients?action=create')}
              className="p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-left"
            >
              <Building2 className="w-5 h-5 mb-2" />
              <p className="font-semibold">Add New Client</p>
              <p className="text-sm text-blue-100 mt-1">Create a new client organization</p>
            </button>

            <button
              onClick={() => router.push('/admin/users?action=create')}
              className="p-4 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-left"
            >
              <Users className="w-5 h-5 mb-2" />
              <p className="font-semibold">Add New User</p>
              <p className="text-sm text-green-100 mt-1">Create a user and assign to client</p>
            </button>

            <button
              onClick={() => router.push('/admin/programs')}
              className="p-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-left"
            >
              <FolderKanban className="w-5 h-5 mb-2" />
              <p className="font-semibold">Assign Programs</p>
              <p className="text-sm text-purple-100 mt-1">Link programs to clients</p>
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-800/30 rounded-xl p-6">
          <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            Multi-Client Management
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed">
            This admin dashboard allows you to onboard unlimited clients. Each client organization has its own isolated data, users, and programs.
            Users automatically see only their client's data when they log in. No SQL commands needed - everything is managed through this interface.
          </p>
        </div>
      </div>
    </div>
  );
}
