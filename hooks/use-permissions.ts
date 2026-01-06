import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/firebase';
import { AppRole } from '@/lib/types';

export interface Permissions {
  // Global permissions
  canCreateProgram: boolean;
  isPlatformAdmin: boolean;

  // Program-specific permissions
  canEditProgram: (programId: string) => Promise<boolean>;
  canDeleteProgram: (programId: string) => Promise<boolean>;
  canManageProgram: (programId: string) => Promise<boolean>;

  // Workstream-specific permissions
  canCreateWorkstream: (programId: string) => Promise<boolean>;
  canEditWorkstream: (workstreamId: string) => Promise<boolean>;
  canManageWorkstream: (workstreamId: string) => Promise<boolean>;

  // Unit-specific permissions
  canCreateUnit: (workstreamId: string) => Promise<boolean>;
  canEditUnit: (unitId: string) => Promise<boolean>;
  canManageUnit: (unitId: string) => Promise<boolean>;

  // Proof permissions
  canUploadProof: (unitId: string) => Promise<boolean>;
  canApproveProof: (unitId: string) => Promise<boolean>;

  // Escalation permissions
  canAcknowledgeEscalation: (unitId: string) => Promise<boolean>;

  // User role
  role: AppRole | null;
  orgId: string | null;
}

export function usePermissions(): Permissions {
  const { user, userData } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile() {
      if (!user) {
        console.log('[usePermissions] No user found');
        setRole(null);
        setOrgId(null);
        return;
      }

      // Use user.id (Supabase auth user object) not user.uid
      const userId = user.id;
      console.log('[usePermissions] Loading profile for user:', userId);

      // Get profile from new RBAC system
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, org_id')
        .eq('user_id', userId)
        .single();

      console.log('[usePermissions] Profile query result:', { profile, error });

      if (profile) {
        console.log('[usePermissions] Setting role:', profile.role, 'org:', profile.org_id);
        setRole(profile.role as AppRole);
        setOrgId(profile.org_id);
      } else {
        console.log('[usePermissions] No profile found or error occurred');
        setRole(null);
        setOrgId(null);
      }
    }

    loadProfile();
  }, [user]);

  // Global permissions
  const canCreateProgram = role === 'PLATFORM_ADMIN' || role === 'PROGRAM_OWNER';
  const isPlatformAdmin = role === 'PLATFORM_ADMIN';

  // Program-specific permissions
  const canEditProgram = async (programId: string): Promise<boolean> => {
    if (!user) return false;
    if (role === 'PLATFORM_ADMIN') return true;

    const { data } = await supabase.rpc('can_manage_program', {
      program_id_param: programId,
    });

    return data === true;
  };

  const canDeleteProgram = canEditProgram;
  const canManageProgram = canEditProgram;

  // Workstream-specific permissions
  const canCreateWorkstream = async (programId: string): Promise<boolean> => {
    if (!user) return false;
    return canManageProgram(programId);
  };

  const canEditWorkstream = async (workstreamId: string): Promise<boolean> => {
    if (!user) return false;
    if (role === 'PLATFORM_ADMIN') return true;

    const { data } = await supabase.rpc('can_manage_workstream', {
      workstream_id_param: workstreamId,
    });

    return data === true;
  };

  const canManageWorkstream = canEditWorkstream;

  // Unit-specific permissions
  const canCreateUnit = async (workstreamId: string): Promise<boolean> => {
    if (!user) return false;
    return canManageWorkstream(workstreamId);
  };

  const canEditUnit = async (unitId: string): Promise<boolean> => {
    if (!user) return false;
    if (role === 'PLATFORM_ADMIN') return true;

    const { data } = await supabase.rpc('can_manage_unit', {
      unit_id_param: unitId,
    });

    return data === true;
  };

  const canManageUnit = canEditUnit;

  // Proof permissions
  const canUploadProof = async (unitId: string): Promise<boolean> => {
    if (!user) return false;
    if (role === 'CLIENT_VIEWER') return false;

    const { data } = await supabase.rpc('can_upload_proof', {
      unit_id_param: unitId,
    });

    return data === true;
  };

  const canApproveProof = async (unitId: string): Promise<boolean> => {
    if (!user) return false;
    if (role === 'PLATFORM_ADMIN') return true;

    const { data } = await supabase.rpc('can_approve_proof', {
      unit_id_param: unitId,
    });

    return data === true;
  };

  // Escalation permissions (PROGRAM_OWNER and WORKSTREAM_LEAD can acknowledge)
  const canAcknowledgeEscalation = async (unitId: string): Promise<boolean> => {
    if (!user) return false;
    if (role === 'PLATFORM_ADMIN') return true;

    // Get workstream_id from unit
    const { data: unit } = await supabase
      .from('units')
      .select('workstream_id')
      .eq('id', unitId)
      .single();

    if (!unit) return false;

    const { data } = await supabase.rpc('effective_role_for_workstream', {
      workstream_id_param: unit.workstream_id,
    });

    return data === 'PROGRAM_OWNER' || data === 'WORKSTREAM_LEAD';
  };

  return {
    canCreateProgram,
    isPlatformAdmin,
    canEditProgram,
    canDeleteProgram,
    canManageProgram,
    canCreateWorkstream,
    canEditWorkstream,
    canManageWorkstream,
    canCreateUnit,
    canEditUnit,
    canManageUnit,
    canUploadProof,
    canApproveProof,
    canAcknowledgeEscalation,
    role,
    orgId,
  };
}
