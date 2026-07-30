-- Fix the boq_timestamps trigger: column is 'assignee' not 'assignee_id'
CREATE OR REPLACE FUNCTION public.process_boq_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if assignee was just populated and delegated_at is null
  -- Note: column is 'assignee' (TEXT), not 'assignee_id'
  IF NEW.assignee IS NOT NULL AND NEW.assignee != '' AND OLD.delegated_at IS NULL THEN
    NEW.delegated_at := NOW();
  END IF;

  -- Check if status changed to IN_PROGRESS and in_progress_at is null
  IF NEW.status = 'IN_PROGRESS' AND (OLD.in_progress_at IS NULL) THEN
    NEW.in_progress_at := NOW();
  END IF;

  -- Check if status changed to DONE and done_at is null
  IF NEW.status = 'DONE' AND (OLD.done_at IS NULL) THEN
    NEW.done_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
