import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader, {
      requireRole: ['PLATFORM_ADMIN'],
    });

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 403 });
    }

    const supabase = getSupabaseServer();

    // Fetch stats in parallel with fault tolerance
    // Use 'orgs' table (not 'organizations') for client count - matches RBAC
    const results = await Promise.allSettled([
      supabase.from('orgs').select('*', { count: 'exact', head: true }).neq('id', 'org_celestar'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('programs').select('*', { count: 'exact', head: true }),
      supabase.from('escalation_notifications').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    ]);

    // Extract counts with fallback to 0
    const totalClients = results[0].status === 'fulfilled' ? (results[0].value.count || 0) : 0;
    const totalUsers = results[1].status === 'fulfilled' ? (results[1].value.count || 0) : 0;
    const totalPrograms = results[2].status === 'fulfilled' ? (results[2].value.count || 0) : 0;
    const pendingNotifications = results[3].status === 'fulfilled' ? (results[3].value.count || 0) : 0;

    return NextResponse.json({
      success: true,
      stats: {
        totalClients,
        totalUsers,
        totalPrograms,
        pendingNotifications,
      },
    });
  } catch (error: any) {
    console.error('Error fetching admin stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
