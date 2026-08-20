-- Create Trusted Sources Registry
CREATE TABLE IF NOT EXISTS public.trusted_sources_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('HEALTH_PRODUCTS', 'FRAUD_ALERTS', 'COMPANIES', 'LICENSES')),
    product_category_label TEXT NOT NULL,
    snippet TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT NOT NULL,
    published_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('SAFE', 'WARNING', 'REVOKED', 'UNREGISTERED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(snippet, '')), 'B')
    ) STORED
);

-- Index for full text search
CREATE INDEX IF NOT EXISTS trusted_sources_search_idx ON public.trusted_sources_registry USING GIN (search_vector);

-- Enable RLS
ALTER TABLE public.trusted_sources_registry ENABLE ROW LEVEL SECURITY;

-- Allow public read access (it's public data)
CREATE POLICY "Public can read trusted sources" 
    ON public.trusted_sources_registry 
    FOR SELECT 
    USING (true);

-- Only admins can modify
CREATE POLICY "Admins can modify trusted sources" 
    ON public.trusted_sources_registry 
    FOR ALL 
    USING (public.current_user_role() = 'ADMIN')
    WITH CHECK (public.current_user_role() = 'ADMIN');

-- RPC to perform hybrid search
CREATE OR REPLACE FUNCTION search_trusted_sources(search_query TEXT, max_results INT DEFAULT 10)
RETURNS SETOF public.trusted_sources_registry AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.trusted_sources_registry
    WHERE search_vector @@ plainto_tsquery('simple', search_query)
       OR title ILIKE '%' || search_query || '%'
       OR snippet ILIKE '%' || search_query || '%'
    ORDER BY ts_rank(search_vector, plainto_tsquery('simple', search_query)) DESC
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
