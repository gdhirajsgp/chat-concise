import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBroadcastChannel, BroadcastMessage } from '@/hooks/useBroadcastChannel';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function TranscriptWindow() {
  const [transcript, setTranscript] = useState('');
  const [originalTranscript, setOriginalTranscript] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useBroadcastChannel('recording-channel', (message: BroadcastMessage) => {
    if (message.type === 'transcript-update' && message.payload?.text) {
      setTranscript(message.payload.text);
      setOriginalTranscript(message.payload.original || message.payload.text);
      
      // Auto-scroll to bottom
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 100);
    } else if (message.type === 'recording-stop') {
      // Keep window open so user can review transcript
    }
  });

  return (
    <div className="min-h-screen bg-background p-4">
      <Card className="h-full">
        <div className="p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Live Transcript</h2>
            {originalTranscript && originalTranscript !== transcript && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOriginal(!showOriginal)}
              >
                {showOriginal ? 'Show English' : 'Show Original'}
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div ref={scrollRef} className="p-4">
            {transcript || originalTranscript ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {showOriginal ? originalTranscript : transcript}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Waiting for transcript...
              </p>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
