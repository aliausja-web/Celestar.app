import { getSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = getSupabaseServer();

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's profile to check if they're a platform admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.role !== 'PLATFORM_ADMIN') {
      return NextResponse.json({ error: 'Forbidden - Platform Admin access required' }, { status: 403 });
    }

    // Fetch stats in parallel
    const [
      { count: totalClients },
      { count: totalUsers },
      { count: totalPrograms },
      { count: pendingNotifications }
    ] = await Promise.all([
      supabase.from('organizations').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('programs').select('*', { count: 'exact', head: true }),
      supabase.from('escalation_notifications').select('*', { count: 'exact', head: true }).eq('status', 'pending')
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalClients: totalClients || 0,
        totalUsers: totalUsers || 0,
        totalPrograms: totalPrograms || 0,
        pendingNotifications: pendingNotifications || 0,
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
