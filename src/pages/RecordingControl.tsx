import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useBroadcastChannel, BroadcastMessage } from '@/hooks/useBroadcastChannel';
import { Mic, Square, FileText, Sparkles, RefreshCw } from 'lucide-react';

export default function RecordingControl() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const { postMessage } = useBroadcastChannel('recording-channel', (message: BroadcastMessage) => {
    if (message.type === 'recording-start') {
      setIsRecording(true);
    } else if (message.type === 'recording-stop') {
      setIsRecording(false);
      setRecordingTime(0);
    } else if (message.type === 'recording-time') {
      setRecordingTime(message.payload);
    }
  });

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleToggleTranscript = () => {
    setShowTranscript(!showTranscript);
    postMessage({ type: 'transcript-update', payload: { action: 'toggle' } });
  };

  const handleGenerateSummary = () => {
    setShowSummary(!showSummary);
    postMessage({ type: 'summary-update', payload: { action: 'generate' } });
  };

  const handleStopRecording = () => {
    postMessage({ type: 'recording-stop' });
  };

  const handleRetryWindows = () => {
    postMessage({ type: 'ensure-windows' });
  };

  return (
    <div className="min-h-screen bg-background p-4 flex items-center justify-center">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold">Recording in Progress</h2>
          {isRecording && (
            <div className="flex items-center justify-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-2xl font-mono font-bold text-primary">
                {formatTime(recordingTime)}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleRetryWindows}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reopen Windows
          </Button>

          <Button
            onClick={handleToggleTranscript}
            variant={showTranscript ? "default" : "outline"}
            className="w-full"
          >
            <FileText className="mr-2 h-4 w-4" />
            {showTranscript ? 'Hide' : 'Show'} Transcript
          </Button>

          <Button
            onClick={handleGenerateSummary}
            variant={showSummary ? "default" : "outline"}
            className="w-full"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {showSummary ? 'Hide' : 'Generate'} AI Summary
          </Button>

          <Button
            onClick={handleStopRecording}
            variant="destructive"
            className="w-full"
            disabled={!isRecording}
          >
            <Square className="mr-2 h-4 w-4" />
            Stop Recording
          </Button>
        </div>
      </Card>
    </div>
  );
}
