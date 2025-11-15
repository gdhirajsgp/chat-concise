-- Add columns for speaker diarization
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS diarized_segments jsonb,
ADD COLUMN IF NOT EXISTS speaker_mappings jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS formatted_transcript text,
ADD COLUMN IF NOT EXISTS audio_length_seconds integer,
ADD COLUMN IF NOT EXISTS transcription_time_ms integer;