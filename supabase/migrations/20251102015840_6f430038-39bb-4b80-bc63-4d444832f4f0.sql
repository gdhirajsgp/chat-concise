-- Add translated_transcript column to meetings table
ALTER TABLE public.meetings 
ADD COLUMN translated_transcript TEXT;