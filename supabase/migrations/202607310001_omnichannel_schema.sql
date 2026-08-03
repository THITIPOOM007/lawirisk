-- Omnichannel Intake Schema Upgrade for EvidenceVerse National Case Intelligence

-- Create intake_channels table
CREATE TABLE IF NOT EXISTS public.intake_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CONSTRAINT check_channel_type CHECK (type IN ('KOUPREY_PLUS', 'PARTNER_API', 'MAIL', 'MANUAL_PHONE', 'MANUAL_WALKIN', 'MANUAL_POST', 'FILE_IMPORT')),
    credentials JSONB, -- Storing encrypted keys, tokens or validation signatures
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create intake_envelopes table
CREATE TABLE IF NOT EXISTS public.intake_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id UUID NOT NULL REFERENCES public.intake_channels(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'RECEIVED' CONSTRAINT check_intake_status CHECK (status IN ('RECEIVED', 'NORMALIZING', 'TRIAGE_PENDING', 'PROMOTED', 'MERGED', 'NEEDS_INFO', 'REJECTED', 'QUARANTINED')),
    complainant_mode TEXT NOT NULL DEFAULT 'IDENTIFIED' CONSTRAINT check_complainant_mode CHECK (complainant_mode IN ('IDENTIFIED', 'INCOMPLETE', 'ANONYMOUS')),
    urgency TEXT NOT NULL DEFAULT 'NORMAL' CONSTRAINT check_urgency CHECK (urgency IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
    urgency_reason TEXT,
    jurisdiction_region TEXT, -- Health Region / Area
    jurisdiction_agency TEXT, -- Assigned Agency
    malware_scan_status TEXT DEFAULT 'CLEAN',
    privacy_risk_status TEXT DEFAULT 'LOW',
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create intake_messages table
CREATE TABLE IF NOT EXISTS public.intake_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES public.intake_envelopes(id) ON DELETE CASCADE,
    headers JSONB, -- Original request headers / email headers
    raw_payload TEXT NOT NULL, -- Original JSON payload or email EML body
    message_id TEXT, -- message identifier from source system (e.g., SMTP Message-ID, Kouprey ID)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create intake_attachments table
CREATE TABLE IF NOT EXISTS public.intake_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES public.intake_envelopes(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    storage_path TEXT NOT NULL, -- S3 / Storage Reference
    malware_scan_status TEXT NOT NULL DEFAULT 'PENDING' CONSTRAINT check_malware CHECK (malware_scan_status IN ('PENDING', 'CLEAN', 'INFECTED')),
    malware_scan_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create intake_participants table
CREATE TABLE IF NOT EXISTS public.intake_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES public.intake_envelopes(id) ON DELETE CASCADE,
    role TEXT NOT NULL CONSTRAINT check_participant_role CHECK (role IN ('SENDER', 'COMPLAINANT', 'WITNESS', 'ACCUSED')),
    name TEXT,
    email TEXT,
    phone TEXT,
    citizen_id TEXT,
    address TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create intake_duplicate_candidates table
CREATE TABLE IF NOT EXISTS public.intake_duplicate_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_envelope_id UUID NOT NULL REFERENCES public.intake_envelopes(id) ON DELETE CASCADE,
    target_envelope_id UUID REFERENCES public.intake_envelopes(id) ON DELETE CASCADE,
    target_case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
    duplicate_score DOUBLE PRECISION NOT NULL,
    matching_signals JSONB NOT NULL, -- Reasons: e.g. { "phone": true, "hash": ["sha..."] }
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create triage_decisions table
CREATE TABLE IF NOT EXISTS public.triage_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID NOT NULL REFERENCES public.intake_envelopes(id) ON DELETE CASCADE,
    action TEXT NOT NULL CONSTRAINT check_triage_action CHECK (action IN ('CREATE_CASE', 'MERGE_INTAKE', 'REQUEST_MORE_INFO', 'ROUTE', 'REJECT_SPAM')),
    reason TEXT NOT NULL,
    destination_case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
    destination_agency TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create external_references table
CREATE TABLE IF NOT EXISTS public.external_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
    envelope_id UUID REFERENCES public.intake_envelopes(id) ON DELETE CASCADE,
    source_system TEXT NOT NULL, -- e.g. 'KOUPREY', 'SMTP', 'PARTNER_API_X'
    external_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_ext_ref UNIQUE (source_system, external_id)
);

-- Create import_batches table
CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    success_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create import_rows table
CREATE TABLE IF NOT EXISTS public.import_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    status TEXT NOT NULL CONSTRAINT check_row_status CHECK (status IN ('SUCCESS', 'FAILED')),
    envelope_id UUID REFERENCES public.intake_envelopes(id) ON DELETE SET NULL,
    error_details TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);
