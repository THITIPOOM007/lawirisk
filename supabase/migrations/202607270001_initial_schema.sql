-- Initial Schema for EvidenceVerse Lite
-- Covers 14 tables for user roles, case tracking, evidence, extractors, relationships, and matches.

-- Create profiles table linked to Supabase auth users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'VIEWER' CONSTRAINT check_profile_role CHECK (role IN ('ADMIN', 'INVESTIGATOR', 'REVIEWER', 'VIEWER')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create cases table
CREATE TABLE IF NOT EXISTS public.cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CONSTRAINT check_case_status CHECK (status IN ('ACTIVE', 'ARCHIVED', 'CLOSED')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create case members table
CREATE TABLE IF NOT EXISTS public.case_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'MEMBER' CONSTRAINT check_case_member_role CHECK (role IN ('OWNER', 'MEMBER')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_case_member UNIQUE (case_id, profile_id)
);

-- Create evidence files table (metadata is immutable once uploaded)
CREATE TABLE IF NOT EXISTS public.evidence_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL, -- Private Storage Path
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CONSTRAINT check_evidence_status CHECK (status IN ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create evidence pages table
CREATE TABLE IF NOT EXISTS public.evidence_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES public.evidence_files(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    text_content TEXT,
    image_path TEXT, -- Optional separate page images
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_evidence_page UNIQUE (evidence_id, page_number)
);

-- Create extraction jobs table
CREATE TABLE IF NOT EXISTS public.extraction_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evidence_id UUID NOT NULL REFERENCES public.evidence_files(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'PENDING' CONSTRAINT check_extraction_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create OCR blocks table
CREATE TABLE IF NOT EXISTS public.ocr_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.evidence_pages(id) ON DELETE CASCADE,
    block_type TEXT NOT NULL DEFAULT 'TEXT' CONSTRAINT check_ocr_block_type CHECK (block_type IN ('TEXT', 'IMAGE', 'TABLE')),
    text TEXT,
    confidence DOUBLE PRECISION,
    bounding_box JSONB, -- Coordinates: {x, y, w, h}
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create extracted entities table
CREATE TABLE IF NOT EXISTS public.extracted_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    type TEXT NOT NULL CONSTRAINT check_entity_type CHECK (type IN ('PERSON', 'ORGANIZATION', 'PHONE', 'EMAIL', 'BANK_ACCOUNT', 'CITIZEN_ID', 'LOCATION')),
    value TEXT NOT NULL, -- Normalized value
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_case_entity UNIQUE (case_id, type, value)
);

-- Create entity mentions table
CREATE TABLE IF NOT EXISTS public.entity_mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES public.extracted_entities(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES public.evidence_pages(id) ON DELETE CASCADE,
    ocr_block_id UUID REFERENCES public.ocr_blocks(id) ON DELETE SET NULL,
    snippet TEXT,
    confidence DOUBLE PRECISION,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create entity relationships table
CREATE TABLE IF NOT EXISTS public.entity_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    source_entity_id UUID NOT NULL REFERENCES public.extracted_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES public.extracted_entities(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- e.g., 'ASSOCIATE', 'EMPLOYEE', 'TRANSACTION_TO', 'DIRECTOR'
    status TEXT NOT NULL DEFAULT 'PROPOSED' CONSTRAINT check_relationship_status CHECK (status IN ('PROPOSED', 'VERIFIED', 'REJECTED')),
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_self_relationship CHECK (source_entity_id <> target_entity_id)
);

-- Create relationship references table
CREATE TABLE IF NOT EXISTS public.relationship_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    relationship_id UUID NOT NULL REFERENCES public.entity_relationships(id) ON DELETE CASCADE,
    evidence_id UUID NOT NULL REFERENCES public.evidence_files(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    quote TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create match candidates table
-- Rules: Matching should not be verified based on 'PERSON' entity name alone
CREATE TABLE IF NOT EXISTS public.match_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    target_case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES public.extracted_entities(id) ON DELETE CASCADE,
    confidence DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CONSTRAINT check_match_status CHECK (status IN ('PENDING', 'VERIFIED', 'DISMISSED')),
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT check_different_cases CHECK (source_case_id <> target_case_id)
);

-- Create reports table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Create audit logs table (Append-only by nature)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);
