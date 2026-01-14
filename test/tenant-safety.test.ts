/**
 * MINIMAL TEST HARNESS - Tenant Safety & Governance
 *
 * Critical invariant tests for commercial release
 * Run with: npx ts-node test/tenant-safety.test.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, testName: string, errorMsg?: string) {
  results.push({
    name: testName,
    passed: condition,
    error: condition ? undefined : (errorMsg || 'Assertion failed'),
  });
}

async function runTests() {
  console.log('\n🧪 STARTING TENANT SAFETY & GOVERNANCE TESTS\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ==================================================================
  // TEST 1: Tenant Isolation - User from Org A cannot query Org B
  // ==================================================================
  console.log('TEST 1: Tenant isolation...');

  // Create two test orgs
  const { data: orgA } = await supabase
    .from('organizations')
    .insert({ name: 'Test Org A', client_code: 'TEST_A' })
    .select()
    .single();

  const { data: orgB } = await supabase
    .from('organizations')
    .insert({ name: 'Test Org B', client_code: 'TEST_B' })
    .select()
    .single();

  // Create programs for each
  const { data: programA } = await supabase
    .from('programs')
    .insert({ name: 'Program A', organization_id: orgA.id })
    .select()
    .single();

  const { data: programB } = await supabase
    .from('programs')
    .insert({ name: 'Program B', organization_id: orgB.id })
    .select()
    .single();

  // Create users for each org
  const { data: { user: userA } } = await supabase.auth.admin.createUser({
    email: 'test_user_a@test.com',
    password: 'testpass123',
    email_confirm: true,
  });

  await supabase
    .from('profiles')
    .update({ organization_id: orgA.id, role: 'PROGRAM_OWNER' })
    .eq('user_id', userA.id);

  const { data: { user: userB } } = await supabase.auth.admin.createUser({
    email: 'test_user_b@test.com',
    password: 'testpass123',
    email_confirm: true,
  });

  await supabase
    .from('profiles')
    .update({ organization_id: orgB.id, role: 'PROGRAM_OWNER' })
    .eq('user_id', userB.id);

  // User A client
  const { data: { session: sessionA } } = await supabase.auth.signInWithPassword({
    email: 'test_user_a@test.com',
    password: 'testpass123',
  });

  const userAClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionA!.access_token}`,
      },
    },
  });

  // Try to access Org B's program with User A's credentials
  const { data: crossTenantPrograms } = await userAClient
    .from('programs')
    .select('*')
    .eq('id', programB.id);

  assert(
    !crossTenantPrograms || crossTenantPrograms.length === 0,
    'TEST 1: Cross-tenant program access blocked by RLS',
    `User A should not see Org B's program, but got ${crossTenantPrograms?.length || 0} results`
  );

  // ==================================================================
  // TEST 2: CLIENT role cannot approve proofs
  // ==================================================================
  console.log('TEST 2: CLIENT approval prevention...');

  // Create CLIENT user
  const { data: { user: clientUser } } = await supabase.auth.admin.createUser({
    email: 'test_client@test.com',
    password: 'testpass123',
    email_confirm: true,
  });

  await supabase
    .from('profiles')
    .update({ organization_id: orgA.id, role: 'CLIENT' })
    .eq('user_id', clientUser.id);

  // Create unit and proof
  const { data: workstreamA } = await supabase
    .from('workstreams')
    .insert({ name: 'Test Workstream', program_id: programA.id })
    .select()
    .single();

  const { data: unitA } = await supabase
    .from('units')
    .insert({
      title: 'Test Unit',
      workstream_id: workstreamA.id,
      proof_config: { required_count: 1 },
    })
    .select()
    .single();

  const { data: proof } = await supabase
    .from('unit_proofs')
    .insert({
      unit_id: unitA.id,
      type: 'DOCUMENT',
      uploaded_by: userA.id,
      file_path: '/test.pdf',
    })
    .select()
    .single();

  // Try to approve as CLIENT (should fail via API)
  const clientSession = await supabase.auth.signInWithPassword({
    email: 'test_client@test.com',
    password: 'testpass123',
  });

  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/units/${unitA.id}/proofs/${proof.id}/approve`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${clientSession.data.session!.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'approve' }),
  });

  assert(
    response.status === 403,
    'TEST 2: CLIENT cannot approve proofs',
    `CLIENT approval should return 403, got ${response.status}`
  );

  // ==================================================================
  // TEST 3: WORKSTREAM_LEAD cannot approve their own uploads
  // ==================================================================
  console.log('TEST 3: Self-approval prevention...');

  const { data: { user: leadUser } } = await supabase.auth.admin.createUser({
    email: 'test_lead@test.com',
    password: 'testpass123',
    email_confirm: true,
  });

  await supabase
    .from('profiles')
    .update({ organization_id: orgA.id, role: 'WORKSTREAM_LEAD' })
    .eq('user_id', leadUser.id);

  const { data: selfProof } = await supabase
    .from('unit_proofs')
    .insert({
      unit_id: unitA.id,
      type: 'PHOTO',
      uploaded_by: leadUser.id,
      file_path: '/test2.jpg',
    })
    .select()
    .single();

  const leadSession = await supabase.auth.signInWithPassword({
    email: 'test_lead@test.com',
    password: 'testpass123',
  });

  const selfApproveResponse = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/units/${unitA.id}/proofs/${selfProof.id}/approve`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${leadSession.data.session!.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'approve' }),
    }
  );

  assert(
    selfApproveResponse.status === 403,
    'TEST 3: WORKSTREAM_LEAD cannot self-approve',
    `Self-approval should return 403, got ${selfApproveResponse.status}`
  );

  // ==================================================================
  // TEST 4: WORKSTREAM_LEAD cannot approve high_criticality proofs
  // ==================================================================
  console.log('TEST 4: High-criticality approval restriction...');

  await supabase
    .from('units')
    .update({ high_criticality: true })
    .eq('id', unitA.id);

  const { data: highCritProof } = await supabase
    .from('unit_proofs')
    .insert({
      unit_id: unitA.id,
      type: 'CERTIFICATE',
      uploaded_by: userA.id, // Different uploader
      file_path: '/cert.pdf',
    })
    .select()
    .single();

  const highCritResponse = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/units/${unitA.id}/proofs/${highCritProof.id}/approve`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${leadSession.data.session!.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'approve' }),
    }
  );

  assert(
    highCritResponse.status === 403,
    'TEST 4: High-criticality requires PROGRAM_OWNER',
    `High-crit approval by LEAD should return 403, got ${highCritResponse.status}`
  );

  // ==================================================================
  // TEST 5: BLOCKED units do not trigger automatic alerts
  // ==================================================================
  console.log('TEST 5: BLOCKED alert suppression...');

  await supabase
    .from('units')
    .update({
      is_blocked: true,
      blocked_reason: 'Test blocker',
      computed_status: 'BLOCKED',
      required_green_by: new Date(Date.now() - 86400000).toISOString(), // 1 day past
    })
    .eq('id', unitA.id);

  // Trigger escalation check
  const { data: escalationResult } = await supabase.rpc('check_and_trigger_unit_escalations_v3');

  // Check if any escalations were created for this blocked unit
  const { data: blockedEscalations } = await supabase
    .from('unit_escalations')
    .select('*')
    .eq('unit_id', unitA.id)
    .eq('escalation_type', 'automatic');

  assert(
    !blockedEscalations || blockedEscalations.length === 0,
    'TEST 5: BLOCKED units skip automatic alerts',
    `BLOCKED unit should have 0 automatic escalations, got ${blockedEscalations?.length || 0}`
  );

  // ==================================================================
  // TEST 6: Proof superseding works correctly
  // ==================================================================
  console.log('TEST 6: Proof superseding...');

  // Unblock unit and approve first proof
  await supabase
    .from('units')
    .update({ is_blocked: false, high_criticality: false })
    .eq('id', unitA.id);

  await supabase
    .from('unit_proofs')
    .update({ approval_status: 'approved', approved_by: userA.id })
    .eq('id', proof.id);

  // Upload and approve second proof
  const { data: newProof } = await supabase
    .from('unit_proofs')
    .insert({
      unit_id: unitA.id,
      type: 'DOCUMENT',
      uploaded_by: leadUser.id,
      file_path: '/test3.pdf',
    })
    .select()
    .single();

  await supabase
    .from('unit_proofs')
    .update({ approval_status: 'approved', approved_by: userA.id })
    .eq('id', newProof.id);

  // Check if first proof was superseded
  const { data: supersededProof } = await supabase
    .from('unit_proofs')
    .select('is_superseded, superseded_by_proof_id')
    .eq('id', proof.id)
    .single();

  assert(
    supersededProof?.is_superseded === true && superseded Proof?.superseded_by_proof_id === newProof.id,
    'TEST 6: Previous proof marked as superseded',
    `First proof should be superseded, got is_superseded=${supersededProof?.is_superseded}`
  );

  // Verify unit status computation ignores superseded proof
  const { data: computedStatus } = await supabase.rpc('compute_unit_status', {
    unit_id_param: unitA.id,
  });

  // Should still be GREEN since new proof is approved
  assert(
    computedStatus === 'GREEN',
    'TEST 6: Status ignores superseded proofs',
    `Unit should be GREEN with new proof, got ${computedStatus}`
  );

  // ==================================================================
  // TEST 7: Attention Queue respects tenant scope
  // ==================================================================
  console.log('TEST 7: Attention Queue tenant isolation...');

  const queueResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/attention-queue`, {
    headers: {
      'Authorization': `Bearer ${sessionA!.access_token}`,
    },
  });

  const queueData = await queueResponse.json();

  // Check that only Org A items are returned
  const hasOrgBItems = queueData.items?.some((item: any) => {
    return item.program_name === 'Program B';
  });

  assert(
    !hasOrgBItems,
    'TEST 7: Attention Queue filters by tenant',
    'User A should not see Org B items in attention queue'
  );

  // ==================================================================
  // CLEANUP
  // ==================================================================
  console.log('\nCleaning up test data...');

  await supabase.from('unit_proofs').delete().in('unit_id', [unitA.id]);
  await supabase.from('units').delete().eq('id', unitA.id);
  await supabase.from('workstreams').delete().eq('id', workstreamA.id);
  await supabase.from('programs').delete().in('id', [programA.id, programB.id]);
  await supabase.from('organizations').delete().in('id', [orgA.id, orgB.id]);
  await supabase.auth.admin.deleteUser(userA.id);
  await supabase.auth.admin.deleteUser(userB.id);
  await supabase.auth.admin.deleteUser(clientUser.id);
  await supabase.auth.admin.deleteUser(leadUser.id);

  // ==================================================================
  // RESULTS
  // ==================================================================
  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(r => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${r.name}`);
    if (r.error) {
      console.log(`  Error: ${r.error}`);
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log(`TOTAL: ${passed}/${results.length} passed`);
  console.log('='.repeat(60) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
