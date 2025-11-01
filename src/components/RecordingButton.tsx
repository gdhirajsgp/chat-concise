import { useState, useRef, useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { VoiceRecorder } from "capacitor-voice-recorder";

interface RecordingButtonProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onRecordingStart?: () => void;
  onChunkReady?: (audioBlob: Blob) => void;
}

export const RecordingButton = ({ onRecordingComplete, onRecordingStart, onChunkReady }: RecordingButtonProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const CHUNK_DURATION = 30000; // 30 seconds in milliseconds

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkIntervalRef.current) clearInterval(chunkIntervalRef.current);
    };
  }, []);

  const pickBestMediaOptions = (): MediaRecorderOptions | undefined => {
    // Only use WebM - mp4 creates malformed chunks when stop/restart is used
    const preferredTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
    ];

    for (const t of preferredTypes) {
      try {
        if ((MediaRecorder as any).isTypeSupported?.(t)) {
          return { mimeType: t } as MediaRecorderOptions;
        }
      } catch { /* ignore */ }
    }
    return { mimeType: 'audio/webm' };
  };


  const requestChunk = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.requestData();
    }
  };

  const startRecording = async () => {
    try {
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        const { value: hasPermission } = await VoiceRecorder.requestAudioRecordingPermission();
        if (!hasPermission) {
          toast.error("Microphone permission denied");
          return;
        }

        await VoiceRecorder.startRecording();
        startTimeRef.current = Date.now();
        setIsRecording(true);
        setRecordingTime(0);

        timerRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);
        onRecordingStart?.();
        toast.success("Recording started (background enabled)");
        return;
      }

      // Web browser path
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      streamRef.current = stream;
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);

      const options = pickBestMediaOptions();
      let recorder: MediaRecorder;
      try {
        recorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
      } catch (e) {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
          console.log(`Chunk received: ${Math.round(e.data.size / 1024)}KB`);
          
          // Send accumulated chunks for transcription
          const blob = new Blob(chunksRef.current, { type: e.data.type || 'audio/webm' });
          const sizeKB = Math.round(blob.size / 1024);
          console.log(`Sending chunk for transcription: ${sizeKB}KB`);
          
          if (blob.size > 20000 && onChunkReady) {
            onChunkReady(blob);
          }
          
          // Clear chunks after sending
          chunksRef.current = [];
        }
      };

      recorder.onstop = () => {
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
          if (blob.size > 20000) {
            onRecordingComplete(blob, duration);
          }
        } else {
          onRecordingComplete(new Blob([], { type: 'audio/webm' }), duration);
        }
        
        chunksRef.current = [];
      };

      recorder.start();
      
      // Request data every 30 seconds without stopping
      chunkIntervalRef.current = setInterval(() => {
        requestChunk();
      }, CHUNK_DURATION);

      onRecordingStart?.();
      toast.success("Recording started");
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast.error("Could not access microphone");
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;

    const isNative = Capacitor.isNativePlatform();

    try {
      if (isNative) {
        const result = await VoiceRecorder.stopRecording();
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

        const base64Data = result.value.recordDataBase64;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/m4a' });
        onRecordingComplete(blob, duration);
      } else {
        // Stop interval
        if (chunkIntervalRef.current) {
          clearInterval(chunkIntervalRef.current);
          chunkIntervalRef.current = null;
        }
        
        // Stop recorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        
        // Stop stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
      }

      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      toast.success("Recording stopped");
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast.error("Error stopping recording");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Button
        onClick={isRecording ? stopRecording : startRecording}
        size="lg"
        variant={isRecording ? "destructive" : "default"}
        className={`h-20 w-20 rounded-full transition-all duration-300 ${
          isRecording 
            ? 'animate-pulse shadow-[0_0_40px_rgba(239,68,68,0.5)]' 
            : 'shadow-[var(--shadow-glow)] hover:scale-110'
        }`}
      >
        {isRecording ? (
          <Square className="h-8 w-8" />
        ) : (
          <Mic className="h-8 w-8" />
        )}
      </Button>
      
      {isRecording && (
        <div className="text-center">
          <p className="text-2xl font-bold text-primary animate-pulse">
            {formatTime(recordingTime)}
          </p>
          <p className="text-sm text-muted-foreground">Recording in progress...</p>
        </div>
      )}
    </div>
  );
};
