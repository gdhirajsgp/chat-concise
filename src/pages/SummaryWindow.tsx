import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useBroadcastChannel, BroadcastMessage } from '@/hooks/useBroadcastChannel';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles } from 'lucide-react';

export default function SummaryWindow() {
  const [summary, setSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const { postMessage } = useBroadcastChannel('recording-channel', (message: BroadcastMessage) => {
    if (message.type === 'summary-update') {
      if (message.payload?.summary) {
        setSummary(message.payload.summary);
        setIsGenerating(false);
      } else if (message.payload?.action === 'generate') {
        setIsGenerating(true);
      }
    } else if (message.type === 'summary-generate') {
      setIsGenerating(true);
    } else if (message.type === 'recording-stop') {
      // Keep window open so user can review summary
    }
  });

  const handleGenerateSummary = () => {
    setIsGenerating(true);
    postMessage({ type: 'summary-update', payload: { action: 'request' } });
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <Card className="h-full">
        <div className="p-4 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Summary
            </h2>
            {!summary && !isGenerating && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSummary}
              >
                Generate
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div className="p-4">
            {isGenerating ? (
              <div className="flex items-center justify-center gap-2 py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
                <p className="text-sm text-muted-foreground">Generating summary...</p>
              </div>
            ) : summary ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {summary}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Click "Generate" to create an AI summary of the transcript.
              </p>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
