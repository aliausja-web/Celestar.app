// Workstream Type Definitions
// Generic execution-focused types that work across all industries

export const WORKSTREAM_TYPES = {
  SITE: 'site',
  BUILD_FITOUT: 'build_fitout',
  MEP_UTILITIES: 'mep_utilities',
  INSTALL_LOGISTICS: 'install_logistics',
  IT_SYSTEMS: 'it_systems',
  TEST_COMMISSION: 'test_commission',
  OPERATIONS_LIVE: 'operations_live',
  COMPLIANCE_PERMITS: 'compliance_permits',
  BRANDING_CREATIVE: 'branding_creative',
  OTHER: 'other',
} as const;

export type WorkstreamType = typeof WORKSTREAM_TYPES[keyof typeof WORKSTREAM_TYPES];

export const WORKSTREAM_TYPE_LABELS: Record<WorkstreamType, string> = {
  [WORKSTREAM_TYPES.SITE]: 'Site',
  [WORKSTREAM_TYPES.BUILD_FITOUT]: 'Build / Fit-Out',
  [WORKSTREAM_TYPES.MEP_UTILITIES]: 'MEP / Utilities',
  [WORKSTREAM_TYPES.INSTALL_LOGISTICS]: 'Install & Logistics',
  [WORKSTREAM_TYPES.IT_SYSTEMS]: 'IT / Systems',
  [WORKSTREAM_TYPES.TEST_COMMISSION]: 'Test / Commission',
  [WORKSTREAM_TYPES.OPERATIONS_LIVE]: 'Operations (Live)',
  [WORKSTREAM_TYPES.COMPLIANCE_PERMITS]: 'Compliance / Permits',
  [WORKSTREAM_TYPES.BRANDING_CREATIVE]: 'Branding / Creative',
  [WORKSTREAM_TYPES.OTHER]: 'Other',
};

export const WORKSTREAM_TYPE_DESCRIPTIONS: Record<WorkstreamType, string> = {
  [WORKSTREAM_TYPES.SITE]: 'Physical location-based execution (store, site, factory, location)',
  [WORKSTREAM_TYPES.BUILD_FITOUT]: 'Civil works, interiors, structural scope',
  [WORKSTREAM_TYPES.MEP_UTILITIES]: 'Electrical, mechanical, plumbing, power, HVAC',
  [WORKSTREAM_TYPES.INSTALL_LOGISTICS]: 'Delivery, installation, staging, rigging',
  [WORKSTREAM_TYPES.IT_SYSTEMS]: 'Networks, POS, software, integrations',
  [WORKSTREAM_TYPES.TEST_COMMISSION]: 'Testing, QA, commissioning, go-live readiness',
  [WORKSTREAM_TYPES.OPERATIONS_LIVE]: 'Staffing, operations, live readiness, day-of execution',
  [WORKSTREAM_TYPES.COMPLIANCE_PERMITS]: 'Approvals, inspections, certifications, authority sign-off',
  [WORKSTREAM_TYPES.BRANDING_CREATIVE]: 'Signage, graphics, visual identity, creative assets',
  [WORKSTREAM_TYPES.OTHER]: 'Other execution scope',
};

// Legacy type mapping for backward compatibility
export const LEGACY_TYPE_MIGRATION: Record<string, WorkstreamType> = {
  'event': WORKSTREAM_TYPES.OPERATIONS_LIVE,
  'events': WORKSTREAM_TYPES.OPERATIONS_LIVE,
  'infrastructure': WORKSTREAM_TYPES.BUILD_FITOUT,
  'logistics': WORKSTREAM_TYPES.INSTALL_LOGISTICS,
  'marketing': WORKSTREAM_TYPES.BRANDING_CREATIVE,
  'operations': WORKSTREAM_TYPES.OPERATIONS_LIVE,
  'technology': WORKSTREAM_TYPES.IT_SYSTEMS,
  'other': WORKSTREAM_TYPES.OTHER,
};

export function getWorkstreamTypeLabel(type: string | null): string {
  if (!type) return '';

  // Check if it's a legacy type
  if (type in LEGACY_TYPE_MIGRATION) {
    return WORKSTREAM_TYPE_LABELS[LEGACY_TYPE_MIGRATION[type]];
  }

  // Check if it's a new type
  if (type in WORKSTREAM_TYPE_LABELS) {
    return WORKSTREAM_TYPE_LABELS[type as WorkstreamType];
  }

  // Fallback: capitalize first letter
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function migrateWorkstreamType(oldType: string | null): WorkstreamType | null {
  if (!oldType) return null;

  // If it's already a new type, return it
  if (Object.values(WORKSTREAM_TYPES).includes(oldType as WorkstreamType)) {
    return oldType as WorkstreamType;
  }

  // If it's a legacy type, migrate it
  if (oldType in LEGACY_TYPE_MIGRATION) {
    return LEGACY_TYPE_MIGRATION[oldType];
  }

  // Unknown type, default to OTHER
  return WORKSTREAM_TYPES.OTHER;
}
