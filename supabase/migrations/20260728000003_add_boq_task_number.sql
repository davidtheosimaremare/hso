-- Add task_number auto-incrementing column
ALTER TABLE public.boq_requests 
ADD COLUMN task_number SERIAL;

-- Ensure the sequence starts at 1000 so the first task gets 1001
ALTER SEQUENCE boq_requests_task_number_seq RESTART WITH 1000;
