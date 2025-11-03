import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { useBroadcastChannel, BroadcastMessage } from '@/hooks/useBroadcastChannel';
import { Mic, Square, FileText, Sparkles } from 'lucide-react';
import { openTranscriptWindow, openSummaryWindow } from '@/lib/windowManager';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function RecordingControl() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcriptWindowOpen, setTranscriptWindowOpen] = useState(false);
  const [summaryWindowOpen, setSummaryWindowOpen] = useState(false);

  const { postMessage } = useBroadcastChannel('recording-channel', (message: BroadcastMessage) => {
    if (message.type === 'recording-start') {
      setIsRecording(true);
    } else if (message.type === 'recording-stop') {
      setIsRecording(false);
      setRecordingTime(0);
      window.close();
    } else if (message.type === 'recording-time') {
      setRecordingTime(message.payload);
    } else if (message.type === 'audio-level') {
      setAudioLevel(message.payload || 0);
    }
  });

  useEffect(() => {
    // Start recording state on mount
    setIsRecording(true);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleOpenTranscript = () => {
    const win = openTranscriptWindow();
    if (win && !win.closed) {
      setTranscriptWindowOpen(true);
    }
  };

  const handleOpenSummary = () => {
    const win = openSummaryWindow();
    if (win && !win.closed) {
      setSummaryWindowOpen(true);
      postMessage({ type: 'summary-generate' });
    }
  };

  const handleStopRecording = () => {
    postMessage({ type: 'recording-stop' });
  };

  // Calculate scale for pulsating effect
  const micScale = 0.9 + (audioLevel / 100) * 0.3;

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <Card className="w-full p-6 space-y-6">
        {/* Audio Visualization */}
        <div className="flex flex-col items-center justify-center space-y-3">
          <div 
            className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center transition-transform duration-150"
            style={{ transform: `scale(${micScale})` }}
          >
            <Mic className="h-8 w-8 text-white" />
          </div>
          
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-muted-foreground">Recording</span>
          </div>
          
          <span className="text-3xl font-mono font-bold text-primary">
            {formatTime(recordingTime)}
          </span>
        </div>

        {/* Compact Button Layout */}
        <TooltipProvider>
          <div className="flex items-center justify-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleOpenTranscript}
                  className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                    transcriptWindowOpen 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <FileText className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open Transcript</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleOpenSummary}
                  className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                    summaryWindowOpen 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  <Sparkles className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open AI Summary</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleStopRecording}
                  disabled={!isRecording}
                  className="w-12 h-12 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                >
                  <Square className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Stop Recording</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </Card>
    </div>
  );
}
