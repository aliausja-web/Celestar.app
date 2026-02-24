import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Create Supabase admin client
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * INTEGRITY MODE: Escalation Checker Cron Job
 *
 * This endpoint should be called every 5-15 minutes by an external cron service
 * (Vercel Cron, GitHub Actions, or similar).
 *
 * It triggers the automatic escalation engine that:
 * 1. Checks all RED units past their deadline (hierarchical model)
 * 2. Checks all RED zones past their deadline (legacy model)
 * 3. Creates escalation events at L1, L2, L3
 * 4. Updates deadlines automatically
 * 5. Logs everything to audit_log/status_events
 *
 * Security: Use CRON_SECRET to prevent unauthorized calls
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret (mandatory - reject if not configured)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('CRON_SECRET not configured - rejecting request for security');
      return NextResponse.json(
        { error: 'Server misconfiguration: CRON_SECRET not set' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('Unauthorized cron request - invalid secret');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('[CRON] Starting escalation check...', new Date().toISOString());

    const supabaseAdmin = getSupabaseAdmin();

    // Call the new hierarchical model escalation engine
    const { data: unitData, error: unitError } = await supabaseAdmin.rpc(
      'check_and_trigger_unit_escalations'
    );

    // Call the legacy zone escalation engine
    const { data: zoneData, error: zoneError } = await supabaseAdmin.rpc(
      'check_and_trigger_escalations'
    );

    // Check and mark expired proofs, revert affected units to RED
    const { data: expiryData, error: expiryError } = await supabaseAdmin.rpc(
      'check_proof_expiry'
    );

    const unitResult = unitData?.[0] || { units_checked: 0, escalations_created: 0 };
    const zoneResult = zoneData?.[0] || { zones_checked: 0, escalations_created: 0 };
    const expiryResult = expiryData?.[0] || { proofs_expired: 0, units_reverted: 0 };

    console.log('[CRON] Escalation check completed:', {
      units: unitResult,
      zones: zoneResult,
      expiry: expiryResult,
    });

    return NextResponse.json({
      success: true,
      units_checked: unitResult.units_checked,
      unit_escalations_created: unitResult.escalations_created,
      zones_checked: zoneResult.zones_checked,
      zone_escalations_created: zoneResult.escalations_created,
      proofs_expired: expiryResult.proofs_expired,
      units_reverted_by_expiry: expiryResult.units_reverted,
      timestamp: new Date().toISOString(),
      errors: {
        unit_error: unitError?.message || null,
        zone_error: zoneError?.message || null,
        expiry_error: expiryError?.message || null,
      },
    });
  } catch (error: any) {
    console.error('[CRON] Fatal error in escalation check:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}
