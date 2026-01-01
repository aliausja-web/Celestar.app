export type UserRole = 'admin' | 'supervisor' | 'client';

export type ZoneStatus = 'RED' | 'GREEN';

export type EscalationLevel = 'L0' | 'L1' | 'L2' | 'L3';

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

export interface Zone {
  id: string;
  projectId: string;
  name: string;
  deliverable: string;
  owner: string;
  status: ZoneStatus;
  lastVerifiedAt: Date | string | null;
  nextVerificationAt: Date | string | null;
  acceptanceCriteria: string[];
  isEscalated: boolean;
  escalationLevel: EscalationLevel | null;
}

export interface Proof {
  id: string;
  projectId: string;
  zoneId: string;
  url: string;
  storagePath: string;
  mediaType: string;
  createdAt: Date | string;
  uploadedByUid: string;
  uploadedByEmail: string;
  note?: string;
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
