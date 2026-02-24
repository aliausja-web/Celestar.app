import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { authorize } from '@/lib/auth-utils';

// POST /api/units/[id]/proofs - Upload proof for a unit
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    // CLIENT_VIEWER cannot upload proofs, all other roles can
    if (context!.role === 'CLIENT_VIEWER') {
      return NextResponse.json(
        { error: 'Forbidden - CLIENT_VIEWER role cannot upload proofs' },
        { status: 403 }
      );
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Verify unit belongs to user's organization and fetch proof config
    const { data: unitCheck } = await supabase
      .from('units')
      .select(`
        workstreams!inner(programs!inner(org_id)),
        requires_reference_number,
        requires_expiry_date,
        requires_reviewer_approval
      `)
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const unitOrgId = (unitCheck.workstreams as any)?.programs?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const body = await request.json();

    // Validate file upload inputs
    const filePath = body.file_path || body.url;

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'file_path or url is required' }, { status: 400 });
    }

    // Path traversal protection
    if (filePath.includes('..') || filePath.includes('\\')) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    // File extension validation
    const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'mp4', 'mov', 'webm', 'doc', 'docx', 'xls', 'xlsx'];
    const fileName = filePath.split('/').pop() || '';
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        { error: `File type not allowed. Accepted: ${ALLOWED_EXTENSIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // Proof type validation
    const ALLOWED_TYPES = ['photo', 'document', 'video', 'link', 'file'];
    const proofType = body.type || 'photo';
    if (!ALLOWED_TYPES.includes(proofType)) {
      return NextResponse.json({ error: 'Invalid proof type' }, { status: 400 });
    }

    // MIME type validation for document uploads
    const ALLOWED_MIME_TYPES: Record<string, string[]> = {
      photo: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      video: ['video/mp4', 'video/quicktime', 'video/webm'],
      document: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream', // fallback for some browsers
      ],
    };
    if (body.mime_type && ALLOWED_MIME_TYPES[proofType]) {
      const allowed = ALLOWED_MIME_TYPES[proofType];
      if (!allowed.includes(body.mime_type) && !body.mime_type.startsWith('application/vnd.openxmlformats')) {
        return NextResponse.json(
          { error: `MIME type ${body.mime_type} not permitted for proof type ${proofType}` },
          { status: 400 }
        );
      }
    }

    // File size validation (if provided by client - 100MB limit)
    const MAX_FILE_SIZE = 100 * 1024 * 1024;
    if (body.file_size && body.file_size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 100MB size limit' }, { status: 413 });
    }

    // Governance structured field enforcement (unit-level config)
    const requiresReferenceNumber = (unitCheck as any).requires_reference_number ?? false;
    const requiresExpiryDate = (unitCheck as any).requires_expiry_date ?? false;

    if (requiresReferenceNumber && !body.reference_number?.trim()) {
      return NextResponse.json(
        { error: 'This unit requires a reference number (permit, certificate, or invoice ID) for each proof submission' },
        { status: 400 }
      );
    }

    if (requiresExpiryDate && !body.expiry_date) {
      return NextResponse.json(
        { error: 'This unit requires an expiry date for each proof submission' },
        { status: 400 }
      );
    }

    // Document category validation (required for document proof type)
    const ALLOWED_DOCUMENT_CATEGORIES = [
      'permit', 'rfp', 'pre_qualification', 'terms_of_reference',
      'contract', 'certificate', 'insurance', 'financial', 'other',
    ];
    if (proofType === 'document') {
      if (!body.document_category) {
        return NextResponse.json(
          { error: 'Document category is required for document proof submissions (e.g. permit, rfp, pre_qualification)' },
          { status: 400 }
        );
      }
      if (!ALLOWED_DOCUMENT_CATEGORIES.includes(body.document_category)) {
        return NextResponse.json(
          { error: `Invalid document_category. Must be one of: ${ALLOWED_DOCUMENT_CATEGORIES.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Validate expiry date format and ensure it is not already past
    if (body.expiry_date) {
      const expiryDate = new Date(body.expiry_date);
      if (isNaN(expiryDate.getTime())) {
        return NextResponse.json({ error: 'Invalid expiry_date format. Use YYYY-MM-DD.' }, { status: 400 });
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiryDate < today) {
        return NextResponse.json(
          { error: 'Expiry date cannot be in the past' },
          { status: 400 }
        );
      }
    }

    const { data: urlData } = supabase.storage
      .from('proofs')
      .getPublicUrl(filePath);

    const publicUrl = urlData.publicUrl;

    // Create proof record — server timestamp, server-locked identity
    // New fields are stored alongside existing ones; all are nullable for backward compat
    const { data: proof, error: proofError } = await supabase
      .from('unit_proofs')
      .insert([
        {
          unit_id: params.id,
          type: proofType,
          url: publicUrl,
          uploaded_at: new Date().toISOString(), // server-generated, not from client
          uploaded_by: context!.user_id,         // identity locked to authenticated user
          uploaded_by_email: context!.email,
          is_valid: true,
          approval_status: 'pending',
          // New integrity fields
          file_name: body.file_name || null,
          file_size: body.file_size || null,
          mime_type: body.mime_type || null,
          file_hash: body.file_hash || null,
          // New governance fields
          document_category: body.document_category || null,
          reference_number: body.reference_number || null,
          expiry_date: body.expiry_date || null,
          notes: body.notes || null,
        },
      ])
      .select()
      .single();

    if (proofError) throw proofError;

    // Status will be automatically updated by trigger
    // Fetch updated unit status
    const { data: unit } = await supabase
      .from('units')
      .select('computed_status, status_computed_at')
      .eq('id', params.id)
      .single();

    return NextResponse.json(
      {
        proof,
        unit_status: unit?.computed_status,
        status_updated: unit?.status_computed_at,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/units/[id]/proofs - Get all proofs for a unit
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const { authorized, context, error: authError } = await authorize(authHeader);

    if (!authorized) {
      return NextResponse.json({ error: authError }, { status: 401 });
    }

    const supabase = getSupabaseServer();

    // TENANT SAFETY: Verify unit belongs to user's organization
    const { data: unitCheck } = await supabase
      .from('units')
      .select('workstreams!inner(programs!inner(org_id))')
      .eq('id', params.id)
      .single();

    if (!unitCheck) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    }

    const unitOrgId = (unitCheck.workstreams as any)?.programs?.org_id;
    if (context!.role !== 'PLATFORM_ADMIN' && unitOrgId !== context!.org_id) {
      return NextResponse.json({ error: 'Forbidden - cross-tenant access denied' }, { status: 403 });
    }

    const { data: proofs, error } = await supabase
      .from('unit_proofs')
      .select('*')
      .eq('unit_id', params.id)
      .order('uploaded_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json(proofs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
