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
    const { transcript } = await req.json();
    
    if (!transcript) {
      throw new Error('No transcript provided');
    }

    // Validate transcript length (max 50,000 characters)
    if (typeof transcript !== 'string') {
      throw new Error('Invalid transcript format');
    }
    
    if (transcript.length > 50000) {
      throw new Error('Transcript too long (max 50,000 characters)');
    }

    console.log('Summarizing meeting transcript...');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert meeting summarizer. Create a comprehensive summary of the meeting transcript with speaker attribution.

Format your response as follows:

## Summary
[Overall meeting summary in 2-3 sentences]

## Key Decisions
- [Decision 1 with speaker who made it]
- [Decision 2 with speaker who made it]

## Action Items
- [Action item 1] - Owner: [Speaker name]
- [Action item 2] - Owner: [Speaker name]

Use the speaker labels (e.g., [Speaker A], [Speaker B]) provided in the transcript to attribute decisions and actions to the correct person.`
          },
          {
            role: 'user',
            content: `Please summarize this meeting transcript:\n\n${transcript}`
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Summarization error:', errorText);
      throw new Error(`Summarization failed: ${errorText}`);
    }

    const result = await response.json();
    const summary = result.choices[0]?.message?.content;

    console.log('Summarization successful');

    return new Response(
      JSON.stringify({ summary }),
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
