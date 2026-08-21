-- Migration: 2-Way Sync between Marketing Hub (marketing_ideas) and To Do Tasks (boq_requests)

-- 1. Ensure required columns exist
ALTER TABLE public.marketing_ideas 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.boq_requests 
ADD COLUMN IF NOT EXISTS marketing_idea_id UUID REFERENCES public.marketing_ideas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_boq_requests_marketing_idea_id ON public.boq_requests(marketing_idea_id);

-- 2. Trigger function: marketing_ideas -> boq_requests
CREATE OR REPLACE FUNCTION public.sync_marketing_idea_to_boq_request()
RETURNS TRIGGER AS $$
DECLARE
    v_task_id UUID;
    v_now TIMESTAMPTZ := now();
    v_assignees JSONB := jsonb_build_array('davidtheo@hokiindo.co.id');
BEGIN
    -- Only process when status or target_date or title/description changed
    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status AND OLD.target_date IS NOT DISTINCT FROM NEW.target_date AND OLD.title = NEW.title AND OLD.description IS NOT DISTINCT FROM NEW.description THEN
        RETURN NEW;
    END IF;

    -- Check if linked boq_requests exists
    SELECT id INTO v_task_id 
    FROM public.boq_requests 
    WHERE marketing_idea_id = NEW.id 
       OR (metadata->>'marketing_idea_id' = NEW.id::text)
    LIMIT 1;

    -- Case 1: Status changed to 'planning' (Direncanakan)
    IF NEW.status = 'planning' THEN
        IF v_task_id IS NOT NULL THEN
            UPDATE public.boq_requests
            SET status = 'TODO',
                title = CASE WHEN NEW.title LIKE '[Marketing]%' THEN NEW.title ELSE '[Marketing] ' || NEW.title END,
                description = COALESCE(NEW.description, description),
                target_date = COALESCE(NEW.target_date, target_date),
                marketing_idea_id = NEW.id,
                updated_at = v_now
            WHERE id = v_task_id AND (status != 'TODO' OR title != (CASE WHEN NEW.title LIKE '[Marketing]%' THEN NEW.title ELSE '[Marketing] ' || NEW.title END));
        ELSE
            INSERT INTO public.boq_requests (
                title,
                description,
                status,
                assignee,
                target_date,
                project_name,
                customer_name,
                pic_name,
                marketing_idea_id,
                metadata,
                created_at,
                updated_at
            ) VALUES (
                CASE WHEN NEW.title LIKE '[Marketing]%' THEN NEW.title ELSE '[Marketing] ' || NEW.title END,
                COALESCE(NEW.description, ''),
                'TODO',
                'davidtheo@hokiindo.co.id',
                NEW.target_date,
                'Marketing Content',
                COALESCE(NEW.platform, 'Marketing'),
                'David Theo',
                NEW.id,
                jsonb_build_object(
                    'marketing_idea_id', NEW.id,
                    'assignees', v_assignees,
                    'platform', NEW.platform,
                    'source', 'marketing_hub'
                ),
                v_now,
                v_now
            );
        END IF;

    -- Case 2: Status changed to 'designing' (Desain)
    ELSIF NEW.status = 'designing' THEN
        IF v_task_id IS NOT NULL THEN
            UPDATE public.boq_requests
            SET status = 'IN_PROGRESS',
                in_progress_at = COALESCE(in_progress_at, v_now),
                marketing_idea_id = NEW.id,
                updated_at = v_now
            WHERE id = v_task_id AND status != 'IN_PROGRESS';
        ELSE
            -- If task doesn't exist yet, create it directly as IN_PROGRESS
            INSERT INTO public.boq_requests (
                title,
                description,
                status,
                assignee,
                target_date,
                in_progress_at,
                project_name,
                customer_name,
                pic_name,
                marketing_idea_id,
                metadata,
                created_at,
                updated_at
            ) VALUES (
                '[Marketing] ' || NEW.title,
                COALESCE(NEW.description, ''),
                'IN_PROGRESS',
                'davidtheo@hokiindo.co.id',
                NEW.target_date,
                v_now,
                'Marketing Content',
                COALESCE(NEW.platform, 'Marketing'),
                'David Theo',
                NEW.id,
                jsonb_build_object(
                    'marketing_idea_id', NEW.id,
                    'assignees', v_assignees,
                    'platform', NEW.platform,
                    'source', 'marketing_hub'
                ),
                v_now,
                v_now
            );
        END IF;

    -- Case 3: Status changed to 'scheduled' or 'published' (Terjadwal / Tayang)
    ELSIF NEW.status IN ('scheduled', 'published') THEN
        IF v_task_id IS NOT NULL THEN
            UPDATE public.boq_requests
            SET status = 'DONE',
                done_at = COALESCE(done_at, v_now),
                marketing_idea_id = NEW.id,
                updated_at = v_now
            WHERE id = v_task_id AND status != 'DONE';
        END IF;

    -- Case 4: Status changed back to 'idea' or 'archived'
    ELSIF NEW.status IN ('idea', 'archived') THEN
        -- Keep or clean up if needed
        NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to marketing_ideas
DROP TRIGGER IF EXISTS trg_sync_marketing_idea_to_boq ON public.marketing_ideas;
CREATE TRIGGER trg_sync_marketing_idea_to_boq
AFTER INSERT OR UPDATE OF status, target_date, title, description ON public.marketing_ideas
FOR EACH ROW
EXECUTE FUNCTION public.sync_marketing_idea_to_boq_request();


-- 3. Trigger function: boq_requests -> marketing_ideas (2-Way Sync)
CREATE OR REPLACE FUNCTION public.sync_boq_request_to_marketing_idea()
RETURNS TRIGGER AS $$
DECLARE
    v_idea_id UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- Only trigger on status update
    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Resolve marketing_idea_id
    IF NEW.marketing_idea_id IS NOT NULL THEN
        v_idea_id := NEW.marketing_idea_id;
    ELSIF NEW.metadata IS NOT NULL AND (NEW.metadata->>'marketing_idea_id') IS NOT NULL THEN
        BEGIN
            v_idea_id := (NEW.metadata->>'marketing_idea_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_idea_id := NULL;
        END;
    END IF;

    -- If not linked to a marketing idea, exit early
    IF v_idea_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Sync back to marketing_ideas based on boq_requests status
    IF NEW.status = 'TODO' THEN
        UPDATE public.marketing_ideas
        SET status = 'planning',
            updated_at = v_now
        WHERE id = v_idea_id AND status != 'planning' AND status != 'idea';

    ELSIF NEW.status = 'IN_PROGRESS' THEN
        UPDATE public.marketing_ideas
        SET status = 'designing',
            updated_at = v_now
        WHERE id = v_idea_id AND status != 'designing';

    ELSIF NEW.status = 'DONE' THEN
        UPDATE public.marketing_ideas
        SET status = 'scheduled',
            updated_at = v_now
        WHERE id = v_idea_id AND status NOT IN ('scheduled', 'published');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to boq_requests
DROP TRIGGER IF EXISTS trg_sync_boq_to_marketing_idea ON public.boq_requests;
CREATE TRIGGER trg_sync_boq_to_marketing_idea
AFTER UPDATE OF status ON public.boq_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_boq_request_to_marketing_idea();
