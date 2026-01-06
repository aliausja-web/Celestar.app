// RBAC Roles for Hierarchical Model
export type AppRole =
  | 'PLATFORM_ADMIN'
  | 'PROGRAM_OWNER'
  | 'WORKSTREAM_LEAD'
  | 'FIELD_CONTRIBUTOR'
  | 'CLIENT_VIEWER';

// Legacy roles for backward compatibility
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

// ============================================================================
// HIERARCHICAL MODEL TYPES (Generic Execution Readiness Platform)
// ============================================================================
// Model: Program → Workstream → Unit (Deliverable)
// Supports: single projects, multi-site initiatives, phased programs, parallel workstreams
// ============================================================================

export type UnitStatus = 'RED' | 'GREEN'; // COMPUTED ONLY - never manually set
export type WorkstreamStatus = 'RED' | 'GREEN'; // COMPUTED based on units

export type StatusChangeReason =
  | 'valid_proof_received'
  | 'proof_deleted'
  | 'proof_invalidated'
  | 'deadline_missed'
  | 'manual_override'
  | 'system_init';

// Program: Top-level initiative (can be single or multi-workstream)
export interface Program {
  id: string;
  name: string;
  description: string | null;
  owner_org: string;
  start_time: Date | string | null;
  end_time: Date | string | null;
  created_at: Date | string;
  created_by: string | null;
  created_by_email: string | null;
}

// Workstream: Logical execution container (site, phase, area, package, discipline)
export interface Workstream {
  id: string;
  program_id: string;
  name: string;
  type: string | null; // 'site', 'phase', 'discipline', 'area', etc.
  ordering: number;
  overall_status: WorkstreamStatus;
  last_update_time: Date | string;
  created_at: Date | string;
}

// Unit (Deliverable): Concrete item that can be proven complete
export interface Unit {
  id: string;
  workstream_id: string;
  title: string;
  owner_party_name: string;
  required_green_by: Date | string | null;
  proof_requirements: {
    required_count: number;
    required_types: ProofType[];
  };
  computed_status: UnitStatus;
  status_computed_at: Date | string;
  last_status_change_time: Date | string;
  current_escalation_level: number; // 0-3
  last_escalated_at: Date | string | null;
  escalation_policy: EscalationPolicyStep[];
  created_at: Date | string;
}

// Proof: Evidence of completion with governance (approval lifecycle)
export type ProofApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface UnitProof {
  id: string;
  unit_id: string;
  type: ProofType;
  url: string;
  captured_at: Date | string | null;
  uploaded_at: Date | string;
  uploaded_by: string;
  uploaded_by_email: string | null;
  is_valid: boolean;
  validation_notes: string | null;
  metadata_exif: Record<string, any>;
  gps_latitude: number | null;
  gps_longitude: number | null;
  // Proof Governance: Approval lifecycle
  approval_status: ProofApprovalStatus;
  approved_by: string | null;
  approved_by_email: string | null;
  approved_at: Date | string | null;
  rejection_reason: string | null;
}

// StatusEvent: Immutable audit log for unit status changes
export interface StatusEvent {
  id: string;
  unit_id: string;
  old_status: UnitStatus | null;
  new_status: UnitStatus;
  changed_at: Date | string;
  changed_by: string | null;
  changed_by_email: string | null;
  reason: StatusChangeReason;
  proof_id: string | null;
  notes: string | null;
}

// UnitDependency: Dependencies between units (hard/soft)
export type DependencyType = 'hard' | 'soft';

export interface UnitDependency {
  id: string;
  downstream_unit_id: string;
  upstream_unit_id: string;
  dependency_type: DependencyType;
  created_at: Date | string;
  created_by: string | null;
  notes: string | null;
}

// UnitEscalation: Track automatic escalations for units (now role-based)
export interface UnitEscalation {
  id: string;
  unit_id: string;
  workstream_id: string;
  program_id: string;
  escalation_level: number; // 1, 2, or 3
  triggered_at: Date | string;
  recipients: Array<{user_id?: string; role?: string; email?: string; name?: string}>;
  threshold_minutes_past_deadline: number;
  message: string | null;
  new_deadline_set_to: Date | string | null;
  acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_by_email: string | null;
  acknowledged_at: Date | string | null;
  acknowledgment_note: string | null;
  status: EscalationStatus;
  created_at: Date | string;
}

// Extended workstream with computed metrics for UI display
export interface WorkstreamWithMetrics extends Workstream {
  total_units: number;
  red_units: number;
  green_units: number;
  stale_units: number; // Units past deadline still RED
  recent_escalations: number; // Escalations in last 24h
}

// Extended unit with proof data for UI display
export interface UnitWithProofs extends Unit {
  proofs: UnitProof[];
  proof_count: number;
  last_proof_time: Date | string | null;
}

// ============================================================================
// RBAC: Organizations, Profiles, and Membership
// ============================================================================

export interface Org {
  id: string;
  name: string;
  created_at: Date | string;
  metadata: Record<string, any>;
}

export interface Profile {
  user_id: string;
  org_id: string;
  full_name: string;
  role: AppRole;
  email: string;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface ProgramMember {
  id: string;
  program_id: string;
  user_id: string;
  role_override: AppRole;
  added_at: Date | string;
  added_by: string | null;
}

export interface WorkstreamMember {
  id: string;
  workstream_id: string;
  user_id: string;
  role_override: AppRole;
  added_at: Date | string;
  added_by: string | null;
}
