import { supabase } from './firebase';
import {
  Project,
  Zone,
  Proof,
  Update,
  ZoneStatus,
  UpdateType,
  Escalation,
  EscalationLevel
} from './types';

export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((project: any) => ({
    id: project.id,
    name: project.name,
    brand: project.brand,
    agency: project.agency,
    location: project.location,
    startDate: project.start_date,
    createdAt: project.created_at,
  })) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    brand: data.brand,
    agency: data.agency,
    location: data.location,
    startDate: data.start_date,
    createdAt: data.created_at,
  } as Project;
}

export async function getZonesByProject(projectId: string): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .eq('project_id', projectId);

  if (error) throw error;
  return (data || []).map((zone: any) => ({
    id: zone.id,
    projectId: zone.project_id,
    name: zone.name,
    deliverable: zone.deliverable,
    owner: zone.owner,
    status: zone.status,
    lastVerifiedAt: zone.last_verified_at,
    nextVerificationAt: zone.next_verification_at,
    acceptanceCriteria: zone.acceptance_criteria || [],
    isEscalated: zone.is_escalated,
    escalationLevel: zone.escalation_level,
  })) as Zone[];
}

export async function getZone(id: string): Promise<Zone | null> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    projectId: data.project_id,
    name: data.name,
    deliverable: data.deliverable,
    owner: data.owner,
    status: data.status,
    lastVerifiedAt: data.last_verified_at,
    nextVerificationAt: data.next_verification_at,
    acceptanceCriteria: data.acceptance_criteria || [],
    isEscalated: data.is_escalated,
    escalationLevel: data.escalation_level,
  } as Zone;
}

export async function getProofsByZone(zoneId: string): Promise<Proof[]> {
  const { data, error } = await supabase
    .from('proofs')
    .select('*')
    .eq('zone_id', zoneId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((proof: any) => ({
    id: proof.id,
    projectId: proof.project_id,
    zoneId: proof.zone_id,
    url: proof.url,
    storagePath: proof.storage_path,
    mediaType: proof.media_type,
    createdAt: proof.created_at,
    uploadedByUid: proof.uploaded_by_uid,
    uploadedByEmail: proof.uploaded_by_email,
    note: proof.note,
  })) as Proof[];
}

export async function getUpdatesByZone(zoneId: string): Promise<Update[]> {
  const { data, error } = await supabase
    .from('updates')
    .select('*')
    .eq('zone_id', zoneId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((update: any) => ({
    id: update.id,
    projectId: update.project_id,
    zoneId: update.zone_id,
    previousStatus: update.previous_status,
    newStatus: update.new_status,
    proofId: update.proof_id,
    note: update.note,
    createdAt: update.created_at,
    byUid: update.by_uid,
    byEmail: update.by_email,
    type: update.type,
  })) as Update[];
}

export async function uploadProof(
  file: File,
  projectId: string,
  zoneId: string,
  userUid: string,
  userEmail: string,
  note?: string
): Promise<Proof> {
  const timestamp = Date.now();
  const storagePath = `proofs/${projectId}/${zoneId}/${timestamp}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('proofs')
    .upload(storagePath, file);

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('proofs')
    .getPublicUrl(storagePath);

  const proof = {
    project_id: projectId,
    zone_id: zoneId,
    url: publicUrl,
    storage_path: storagePath,
    media_type: file.type,
    uploaded_by_uid: userUid,
    uploaded_by_email: userEmail,
    note,
  };

  const { data, error } = await supabase
    .from('proofs')
    .insert([proof])
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    projectId: data.project_id,
    zoneId: data.zone_id,
    url: data.url,
    storagePath: data.storage_path,
    mediaType: data.media_type,
    createdAt: data.created_at,
    uploadedByUid: data.uploaded_by_uid,
    uploadedByEmail: data.uploaded_by_email,
    note: data.note,
  } as Proof;
}

export async function createUpdate(
  projectId: string,
  zoneId: string,
  previousStatus: ZoneStatus,
  newStatus: ZoneStatus,
  userUid: string,
  userEmail: string,
  type: UpdateType = 'STATUS_CHANGE',
  proofId?: string,
  note?: string
): Promise<Update> {
  const update = {
    project_id: projectId,
    zone_id: zoneId,
    previous_status: previousStatus,
    new_status: newStatus,
    proof_id: proofId,
    note,
    by_uid: userUid,
    by_email: userEmail,
    type,
  };

  const { data, error } = await supabase
    .from('updates')
    .insert([update])
    .select()
    .single();

  if (error) throw error;

  const { error: zoneError } = await supabase
    .from('zones')
    .update({
      status: newStatus,
      last_verified_at: new Date().toISOString(),
    })
    .eq('id', zoneId);

  if (zoneError) throw zoneError;

  return {
    id: data.id,
    projectId: data.project_id,
    zoneId: data.zone_id,
    previousStatus: data.previous_status,
    newStatus: data.new_status,
    proofId: data.proof_id,
    note: data.note,
    createdAt: data.created_at,
    byUid: data.by_uid,
    byEmail: data.by_email,
    type: data.type,
  } as Update;
}

export async function createEscalation(
  projectId: string,
  zoneId: string,
  level: EscalationLevel,
  note: string,
  userEmail: string,
  responsiblePerson?: string,
  eta?: Date
): Promise<Escalation> {
  const escalation = {
    project_id: projectId,
    zone_id: zoneId,
    level,
    note,
    responsible_person: responsiblePerson,
    eta: eta ? eta.toISOString() : null,
    created_by: userEmail,
    created_by_email: userEmail,
  };

  const { data, error } = await supabase
    .from('escalations')
    .insert([escalation])
    .select()
    .single();

  if (error) throw error;

  const { error: zoneError } = await supabase
    .from('zones')
    .update({
      is_escalated: true,
      escalation_level: level,
    })
    .eq('id', zoneId);

  if (zoneError) throw zoneError;

  return {
    id: data.id,
    projectId: data.project_id,
    zoneId: data.zone_id,
    level: data.level,
    note: data.note,
    responsiblePerson: data.responsible_person,
    eta: data.eta,
    createdAt: data.created_at,
    createdBy: data.created_by,
    createdByEmail: data.created_by_email,
  } as Escalation;
}

export async function getEscalationsByProject(projectId: string): Promise<Escalation[]> {
  const { data, error } = await supabase
    .from('escalations')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((escalation: any) => ({
    id: escalation.id,
    projectId: escalation.project_id,
    zoneId: escalation.zone_id,
    level: escalation.level,
    note: escalation.note,
    responsiblePerson: escalation.responsible_person,
    eta: escalation.eta,
    createdAt: escalation.created_at,
    createdBy: escalation.created_by,
    createdByEmail: escalation.created_by_email,
  })) as Escalation[];
}

export function requiresProof(previousStatus: ZoneStatus, newStatus: ZoneStatus): boolean {
  if (newStatus === 'GREEN') return true;
  if (previousStatus === 'RED' && newStatus !== 'RED') return true;
  return false;
}
