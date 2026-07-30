-- Add timestamp columns
ALTER TABLE public.boq_requests
ADD COLUMN delegated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN in_progress_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN done_at TIMESTAMP WITH TIME ZONE;

-- Create function for trigger
CREATE OR REPLACE FUNCTION public.process_boq_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if assignee was just populated and delegated_at is null
  IF NEW.assignee_id IS NOT NULL AND OLD.delegated_at IS NULL THEN
    NEW.delegated_at := NOW();
  END IF;

  -- Check if status changed to IN_PROGRESS and in_progress_at is null
  IF NEW.status = 'IN_PROGRESS' AND OLD.in_progress_at IS NULL THEN
    NEW.in_progress_at := NOW();
  END IF;

  -- Check if status changed to DONE and done_at is null
  IF NEW.status = 'DONE' AND OLD.done_at IS NULL THEN
    NEW.done_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER tr_boq_timestamps
BEFORE UPDATE ON public.boq_requests
FOR EACH ROW
EXECUTE FUNCTION public.process_boq_timestamps();
