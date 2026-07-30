-- Create boq_comments table
CREATE TABLE public.boq_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.boq_requests(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.boq_comments ENABLE ROW LEVEL SECURITY;

-- Policies for boq_comments
-- Anyone authenticated can view comments
CREATE POLICY "Enable read access for all authenticated users" ON "public"."boq_comments"
AS PERMISSIVE FOR SELECT
TO authenticated
USING (true);

-- Anyone authenticated can insert comments
CREATE POLICY "Enable insert for authenticated users" ON "public"."boq_comments"
AS PERMISSIVE FOR INSERT
TO authenticated
WITH CHECK (true);

-- Only the creator can update or delete their comment (optional, but good practice)
CREATE POLICY "Enable update for users based on email" ON "public"."boq_comments"
AS PERMISSIVE FOR UPDATE
TO authenticated
USING (auth.jwt()->>'email' = user_email);

CREATE POLICY "Enable delete for users based on email" ON "public"."boq_comments"
AS PERMISSIVE FOR DELETE
TO authenticated
USING (auth.jwt()->>'email' = user_email);
