-- Create meetings table to store all meeting records
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  audio_url TEXT,
  transcript TEXT,
  summary TEXT,
  duration_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own meetings" 
ON public.meetings 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own meetings" 
ON public.meetings 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meetings" 
ON public.meetings 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meetings" 
ON public.meetings 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_meetings_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for audio recordings
INSERT INTO storage.buckets (id, name, public) 
VALUES ('meeting-recordings', 'meeting-recordings', false)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for meeting recordings
CREATE POLICY "Users can upload their own recordings" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'meeting-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own recordings" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'meeting-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own recordings" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'meeting-recordings' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);