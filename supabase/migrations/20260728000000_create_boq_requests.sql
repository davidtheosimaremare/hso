-- Create boq_requests table
CREATE TABLE public.boq_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    file_url TEXT,
    file_name TEXT,
    status TEXT NOT NULL DEFAULT 'TODO',
    assignee TEXT,
    target_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT
);

-- Enable RLS
ALTER TABLE public.boq_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for boq_requests (allow authenticated users to do everything for now, or based on roles if needed)
-- For simplicity in this internal tool, we allow all authenticated users to read and write.
CREATE POLICY "Allow authenticated read access" ON public.boq_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert access" ON public.boq_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update access" ON public.boq_requests FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete access" ON public.boq_requests FOR DELETE TO authenticated USING (true);

-- Create storage bucket for BOQ files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('boq-files', 'boq-files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for boq-files bucket
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'boq-files');

CREATE POLICY "Authenticated users can upload files" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'boq-files');

CREATE POLICY "Authenticated users can update files" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id = 'boq-files');

CREATE POLICY "Authenticated users can delete files" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'boq-files');

-- Create a trigger to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_boq_requests_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_boq_requests_updated_at
    BEFORE UPDATE ON public.boq_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_boq_requests_updated_at_column();
