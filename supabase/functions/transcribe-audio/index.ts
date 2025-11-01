import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audioBase64, mimeType } = await req.json();
    
    if (!audioBase64) {
      throw new Error('No audio data provided');
    }

    // Normalize and map content type to a safe filename extension
    const rawType = (mimeType as string | undefined)?.toLowerCase() || 'audio/webm';
    const baseType = rawType.split(';')[0].trim();

    const typeToExt: Record<string, string> = {
      'audio/webm': 'webm',
      'video/webm': 'webm',
      'audio/wav': 'wav',
      'audio/x-wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/mp3': 'mp3',
      'audio/ogg': 'ogg',
      'audio/oga': 'oga',
      'audio/opus': 'ogg',
      'audio/flac': 'flac',
      'audio/mp4': 'mp4',
      'audio/m4a': 'm4a',
      'audio/x-m4a': 'm4a',
      'audio/aac': 'm4a', // wrap AAC as m4a/mp4 container for Whisper
    };

    const ext = typeToExt[baseType] ?? 'webm';
    const contentType = (baseType in typeToExt) ? baseType : 'audio/webm';

    console.log(`Transcribing audio... rawType=${rawType} baseType=${baseType} useType=${contentType} ext=${ext}`);

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Decode base64 audio (supports data URLs like "data:audio/webm;base64,....")
    let base64 = audioBase64 as string;
    const commaIndex = base64.indexOf(',');
    if (commaIndex !== -1) {
      base64 = base64.slice(commaIndex + 1);
    }
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Prepare form data for Whisper API
    const formData = new FormData();
    const blob = new Blob([bytes], { type: contentType });
    formData.append('file', new File([blob], `audio.${ext}`, { type: contentType }));
    formData.append('model', 'whisper-1');

    // Call OpenAI Whisper via Lovable AI Gateway
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Transcription error:', errorText);
      throw new Error(`Transcription failed: ${errorText}`);
    }

    const result = await response.json();
    console.log('Transcription successful');

    return new Response(
      JSON.stringify({ transcript: result.text }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
