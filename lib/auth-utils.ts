import { createClient } from '@supabase/supabase-js';
import { AppRole } from './types';

// Create Supabase client for server-side auth checks
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

export interface AuthContext {
  user_id: string;
  email: string;
  org_id: string;
  role: AppRole;
}

/**
 * Get authenticated user context from authorization header
 */
export async function getAuthContext(authHeader: string | null): Promise<AuthContext | null> {
  if (!authHeader) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const token = authHeader.replace('Bearer ', '');

  // Verify token and get user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return null;
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('org_id, role, email')
    .eq('user_id', user.id)
    .single();

  if (profileError || !profile) {
    return null;
  }

  return {
    user_id: user.id,
    email: profile.email,
    org_id: profile.org_id,
    role: profile.role as AppRole,
  };
}

/**
 * Authorization middleware for API routes
 * Checks if user has required role or permission to access resource
 */
export async function authorize(
  authHeader: string | null,
  options: {
    requireRole?: AppRole | AppRole[];
    requirePlatformAdmin?: boolean;
    customCheck?: (ctx: AuthContext) => Promise<boolean>;
  } = {}
): Promise<{ authorized: boolean; context: AuthContext | null; error?: string }> {
  const context = await getAuthContext(authHeader);

  if (!context) {
    return { authorized: false, context: null, error: 'Unauthorized - Invalid or missing token' };
  }

  // Platform admin bypass
  if (options.requirePlatformAdmin && context.role !== 'PLATFORM_ADMIN') {
    return { authorized: false, context, error: 'Forbidden - Platform admin access required' };
  }

  // Role check
  if (options.requireRole) {
    const allowedRoles = Array.isArray(options.requireRole) ? options.requireRole : [options.requireRole];
    if (!allowedRoles.includes(context.role)) {
      return {
        authorized: false,
        context,
        error: `Forbidden - Required role: ${allowedRoles.join(' or ')}`
      };
    }
  }

  // Custom authorization check
  if (options.customCheck) {
    const customResult = await options.customCheck(context);
    if (!customResult) {
      return { authorized: false, context, error: 'Forbidden - Custom authorization failed' };
    }
  }

  return { authorized: true, context };
}

/**
 * Check if user can manage a program
 */
export async function canManageProgram(userId: string, programId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  // Call the database function
  const { data, error } = await supabase.rpc('can_manage_program', {
    program_id_param: programId,
  });

  if (error) {
    console.error('Error checking program permissions:', error);
    return false;
  }

  return data === true;
}

/**
 * Check if user can manage a workstream
 */
export async function canManageWorkstream(userId: string, workstreamId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('can_manage_workstream', {
    workstream_id_param: workstreamId,
  });

  if (error) {
    console.error('Error checking workstream permissions:', error);
    return false;
  }

  return data === true;
}

/**
 * Check if user can manage a unit
 */
export async function canManageUnit(userId: string, unitId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('can_manage_unit', {
    unit_id_param: unitId,
  });

  if (error) {
    console.error('Error checking unit permissions:', error);
    return false;
  }

  return data === true;
}

/**
 * Check if user can upload proof
 */
export async function canUploadProof(userId: string, unitId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('can_upload_proof', {
    unit_id_param: unitId,
  });

  if (error) {
    console.error('Error checking proof upload permissions:', error);
    return false;
  }

  return data === true;
}

/**
 * Check if user can approve/invalidate proof
 */
export async function canApproveProof(userId: string, unitId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('can_approve_proof', {
    unit_id_param: unitId,
  });

  if (error) {
    console.error('Error checking proof approval permissions:', error);
    return false;
  }

  return data === true;
}
