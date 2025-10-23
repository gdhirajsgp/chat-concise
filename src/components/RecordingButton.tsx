import { useState, useRef, useEffect } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { VoiceRecorder } from "capacitor-voice-recorder";

interface RecordingButtonProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onRecordingStart?: () => void;
}

export const RecordingButton = ({ onRecordingComplete, onRecordingStart }: RecordingButtonProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      // Check if running on native platform
      const isNative = Capacitor.isNativePlatform();
      
      if (isNative) {
        // Request permissions for native audio recording
        const { value: hasPermission } = await VoiceRecorder.requestAudioRecordingPermission();
        
        if (!hasPermission) {
          toast.error("Microphone permission denied");
          return;
        }

        // Start native recording
        await VoiceRecorder.startRecording();
        
        startTimeRef.current = Date.now();
        setIsRecording(true);
        setRecordingTime(0);
        
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);

        onRecordingStart?.();
        toast.success("Recording started (background enabled)");
      } else {
        // Web browser fallback
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          } 
        });

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus'
        });
        
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
          onRecordingComplete(blob, duration);
          
          stream.getTracks().forEach(track => track.stop());
        };

        startTimeRef.current = Date.now();
        mediaRecorder.start(1000);
        setIsRecording(true);
        setRecordingTime(0);
        
        timerRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);

        onRecordingStart?.();
        toast.success("Recording started");
      }
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
        // Stop native recording
        const result = await VoiceRecorder.stopRecording();
        const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        // Convert base64 to blob
        const base64Data = result.value.recordDataBase64;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/aac' });
        
        onRecordingComplete(blob, duration);
      } else {
        // Web browser fallback
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
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
