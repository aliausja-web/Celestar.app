// Integrity Mode: Extended roles with strict RBAC
export type UserRole =
  | 'system_owner'      // Celestar - full control
  | 'org_admin'         // CEO - org management, cannot manipulate status
  | 'project_manager'   // Receives escalations, can acknowledge
  | 'site_coordinator'  // Uploads proof, adds notes
  | 'viewer'            // Read-only access
  | 'admin'             // Legacy - maps to org_admin
  | 'supervisor'        // Legacy - maps to site_coordinator
  | 'client';           // Legacy - maps to viewer

export type ZoneStatus = 'RED' | 'GREEN'; // COMPUTED ONLY - never manually set

export type EscalationLevel = 'L0' | 'L1' | 'L2' | 'L3';

export type ProofType = 'photo' | 'video' | 'document';

export type AuditEventType =
  | 'proof_uploaded'
  | 'proof_deleted'
  | 'status_changed_auto'
  | 'escalation_triggered'
  | 'escalation_acknowledged'
  | 'deadline_updated'
  | 'zone_created'
  | 'zone_updated'
  | 'user_added'
  | 'user_role_changed'
  | 'project_created'
  | 'project_updated'
  | 'system_override';

export type EscalationStatus = 'active' | 'resolved';

export type UpdateType = 'STATUS_CHANGE' | 'ESCALATION' | 'NOTE' | 'ADMIN_OVERRIDE';

export interface User {
  uid: string;
  email: string;
  role: UserRole;
  org_id: string;
  created_at: Date | string;
}

export interface Project {
  id: string;
  name: string;
  brand: string;
  agency: string;
  location: string;
  startDate: string;
  createdAt: Date | string;
}

// Escalation Policy Step
export interface EscalationPolicyStep {
  level: number;
  threshold_minutes_past_deadline: number;
  recipients_role: string[]; // ['site_coordinator'], ['project_manager'], ['org_admin']
  new_deadline_minutes_from_now: number;
}

export interface Zone {
  id: string;
  projectId: string;
  name: string;
  deliverable: string;
  owner: string;

  // COMPUTED STATUS - Never set manually!
  status: ZoneStatus; // Legacy field for backwards compatibility
  computed_status: ZoneStatus; // THE TRUTH - computed by server only
  status_computed_at: Date | string;

  // Proof requirements
  required_proof_types: ProofType[]; // ['photo'], ['photo','video'], etc.
  required_proof_count: number; // Minimum proofs needed

  // Verification tracking
  lastVerifiedAt: Date | string | null;
  nextVerificationAt: Date | string | null;
  acceptanceCriteria: string[];

  // Escalation state
  isEscalated: boolean;
  escalationLevel: EscalationLevel | null; // Legacy
  current_escalation_level: number; // 0-3
  last_escalated_at: Date | string | null;

  // Deadline & escalation policy
  readiness_deadline: Date | string | null;
  escalation_policy: EscalationPolicyStep[];

  // Legacy fields (for backward compatibility during migration)
  deadline: Date | string | null;
  escalation1Hours: number;
  escalation2Hours: number;
  escalation3Hours: number;
  siteCoordinator: string | null;
  siteAuthority: string | null;
  finalAuthority: string | null;
  lastEscalationCheck: Date | string | null;
}

export interface Proof {
  id: string;
  projectId: string;
  zoneId: string;
  url: string;
  storagePath: string;
  mediaType: string; // Legacy
  proof_type: ProofType; // Integrity Mode: 'photo', 'video', 'document'
  createdAt: Date | string;
  uploadedByUid: string;
  uploadedByEmail: string;
  note?: string;

  // Integrity Mode: Enhanced metadata
  metadata_exif: Record<string, any>; // EXIF data from image
  gps_latitude: number | null;
  gps_longitude: number | null;
  capture_timestamp: Date | string | null;
  is_valid: boolean; // Can be invalidated if fraud detected
  validation_notes: string | null;
}

export interface Update {
  id: string;
  projectId: string;
  zoneId: string;
  previousStatus: ZoneStatus;
  newStatus: ZoneStatus;
  proofId?: string;
  note?: string;
  createdAt: Date | string;
  byUid: string;
  byEmail: string;
  type: UpdateType;
}

export interface Escalation {
  id: string;
  projectId: string;
  zoneId: string;
  level: EscalationLevel;
  note: string;
  responsiblePerson?: string;
  eta?: Date | string;
  createdAt: Date | string;
  createdBy: string;
  createdByEmail: string;
}

// Integrity Mode: Escalation Events (non-dismissable, acknowledgeable only)
export interface EscalationEvent {
  id: string;
  zone_id: string;
  project_id: string;
  level: number; // 1, 2, or 3
  triggered_at: Date | string;
  recipients: Array<{role?: string; email?: string; name?: string}>;
  threshold_minutes_past_deadline: number;
  new_deadline_set_to: Date | string | null;
  acknowledged: boolean;
  acknowledged_by_uid: string | null;
  acknowledged_by_email: string | null;
  acknowledged_at: Date | string | null;
  acknowledgment_note: string | null;
  status: EscalationStatus; // 'active' or 'resolved' (only when zone turns GREEN)
  created_at: Date | string;
}

// Integrity Mode: Audit Log (immutable, append-only)
export interface AuditLogEntry {
  id: string;
  event_type: AuditEventType;
  entity_type: 'zone' | 'proof' | 'escalation' | 'user' | 'project' | 'system';
  entity_id: string | null;
  project_id: string | null;
  zone_id: string | null;
  actor_uid: string | null;
  actor_email: string | null;
  actor_role: string | null;
  event_data: Record<string, any>;
  metadata: Record<string, any>;
  rationale: string | null;
  created_at: Date | string;
}
