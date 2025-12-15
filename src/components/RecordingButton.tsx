import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { VoiceRecorder } from "capacitor-voice-recorder";

interface RecordingButtonProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onRecordingStart?: () => void;
  onChunkReady?: (audioBlob: Blob) => void;
  onRecordingCancel?: () => void;
}

const SILENCE_PAUSE_THRESHOLD = 3 * 60 * 1000; // 3 minutes
const SILENCE_STOP_THRESHOLD = 10 * 60 * 1000; // 10 minutes
const SILENCE_DETECTION_INTERVAL = 1000; // Check every second
const AUDIO_LEVEL_THRESHOLD = 0.01; // Minimum audio level to consider as "sound"

export const RecordingButton = ({ 
  onRecordingComplete, 
  onRecordingStart, 
  onChunkReady,
  onRecordingCancel 
}: RecordingButtonProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [silenceTime, setSilenceTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  const pausedByUserRef = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceCheckRef = useRef<NodeJS.Timeout | null>(null);
  const pausedChunksRef = useRef<Blob[]>([]);
  
  const CHUNK_DURATION = 30000; // 30 seconds

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (chunkIntervalRef.current) clearTimeout(chunkIntervalRef.current);
    if (silenceCheckRef.current) clearInterval(silenceCheckRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  const pickBestMediaOptions = (): MediaRecorderOptions | undefined => {
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

  const getAudioLevel = useCallback(() => {
    if (!analyserRef.current) return 0;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    return average / 255; // Normalize to 0-1
  }, []);

  const checkSilence = useCallback(() => {
    if (!isRecordingRef.current || isPausedRef.current) return;
    
    const level = getAudioLevel();
    const now = Date.now();
    
    if (level < AUDIO_LEVEL_THRESHOLD) {
      if (!silenceStartRef.current) {
        silenceStartRef.current = now;
      }
      
      const silenceDuration = now - silenceStartRef.current;
      setSilenceTime(Math.floor(silenceDuration / 1000));
      
      // Auto-stop after 10 minutes of silence (only if not manually paused)
      if (silenceDuration >= SILENCE_STOP_THRESHOLD && !pausedByUserRef.current) {
        toast.warning("No sound detected for 10 minutes - stopping recording");
        stopRecording();
        return;
      }
      
      // Auto-pause after 3 minutes of silence (only if not already paused)
      if (silenceDuration >= SILENCE_PAUSE_THRESHOLD && !pausedByUserRef.current) {
        toast.info("No sound detected for 3 minutes - pausing recording");
        pauseRecording();
        return;
      }
    } else {
      // Sound detected - reset silence timer
      silenceStartRef.current = null;
      setSilenceTime(0);
    }
  }, [getAudioLevel]);

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
        setIsPaused(false);
        setRecordingTime(0);
        setSilenceTime(0);

        timerRef.current = setInterval(() => setRecordingTime((p) => p + 1), 1000);
        onRecordingStart?.();
        toast.success("Recording started");
        return;
      }

      // Web browser path
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      streamRef.current = stream;
      isRecordingRef.current = true;
      isPausedRef.current = false;
      pausedByUserRef.current = false;
      startTimeRef.current = Date.now();
      silenceStartRef.current = null;
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      setSilenceTime(0);
      
      timerRef.current = setInterval(() => {
        if (!isPausedRef.current) {
          setRecordingTime((p) => p + 1);
        }
      }, 1000);

      // Setup audio analysis for silence detection
      try {
        audioContextRef.current = new AudioContext();
        const source = audioContextRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 256;
        source.connect(analyserRef.current);
        
        silenceCheckRef.current = setInterval(checkSilence, SILENCE_DETECTION_INTERVAL);
      } catch (e) {
        console.warn('Could not setup silence detection:', e);
      }

      const startNewRecorder = () => {
        if (!isRecordingRef.current || !streamRef.current || isPausedRef.current) return;

        const options = pickBestMediaOptions();
        let recorder: MediaRecorder;
        try {
          recorder = options ? new MediaRecorder(streamRef.current!, options) : new MediaRecorder(streamRef.current!);
        } catch (e) {
          recorder = new MediaRecorder(streamRef.current!);
        }

        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          if (chunksRef.current.length === 0) return;

          const raw = new Blob(chunksRef.current);
          const inferred = (raw.type && raw.type !== '') ? raw.type : (chunksRef.current[0]?.type || 'audio/webm');
          const baseType = inferred.split(';')[0];
          const finalBlob = new Blob([raw], { type: baseType });
          const sizeKB = Math.round(finalBlob.size / 1024);
          console.log(`Chunk ready: ${sizeKB}KB, type: ${finalBlob.type}`);

          if (isPausedRef.current) {
            // Store chunk for later if paused
            pausedChunksRef.current.push(finalBlob);
            console.log('Chunk stored during pause');
            return;
          }

          if (isRecordingRef.current && streamRef.current && streamRef.current.active) {
            if (onChunkReady && finalBlob.size > 20000) {
              onChunkReady(finalBlob);
            } else {
              console.warn('Skipping tiny chunk:', sizeKB, 'KB');
            }

            setTimeout(() => {
              if (isRecordingRef.current && !isPausedRef.current) startNewRecorder();
            }, 100);
          } else {
            const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
            if (finalBlob.size > 20000) {
              onRecordingComplete(finalBlob, duration);
            } else {
              toast.info('No meaningful audio captured');
            }
          }
        };

        recorder.start();
        if (chunkIntervalRef.current) clearTimeout(chunkIntervalRef.current);
        chunkIntervalRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }, CHUNK_DURATION);
        console.log('MediaRecorder started');
      };

      startNewRecorder();
      onRecordingStart?.();
      toast.success("Recording started");
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast.error("Could not access microphone");
    }
  };

  const pauseRecording = () => {
    if (!isRecording || isPaused) return;
    
    isPausedRef.current = true;
    pausedByUserRef.current = true;
    setIsPaused(true);
    
    // Stop current recorder to save current chunk
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (chunkIntervalRef.current) {
      clearTimeout(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    
    toast.info("Recording paused");
  };

  const resumeRecording = () => {
    if (!isRecording || !isPaused) return;
    
    isPausedRef.current = false;
    setIsPaused(false);
    silenceStartRef.current = null;
    setSilenceTime(0);
    
    // Process any stored chunks
    if (pausedChunksRef.current.length > 0) {
      pausedChunksRef.current.forEach(chunk => {
        if (onChunkReady && chunk.size > 20000) {
          onChunkReady(chunk);
        }
      });
      pausedChunksRef.current = [];
    }
    
    // Start new recorder
    if (streamRef.current && streamRef.current.active) {
      const startNewRecorder = () => {
        if (!isRecordingRef.current || !streamRef.current || isPausedRef.current) return;

        const options = pickBestMediaOptions();
        let recorder: MediaRecorder;
        try {
          recorder = options ? new MediaRecorder(streamRef.current!, options) : new MediaRecorder(streamRef.current!);
        } catch (e) {
          recorder = new MediaRecorder(streamRef.current!);
        }

        mediaRecorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        recorder.onstop = () => {
          if (chunksRef.current.length === 0) return;

          const raw = new Blob(chunksRef.current);
          const inferred = (raw.type && raw.type !== '') ? raw.type : (chunksRef.current[0]?.type || 'audio/webm');
          const baseType = inferred.split(';')[0];
          const finalBlob = new Blob([raw], { type: baseType });
          const sizeKB = Math.round(finalBlob.size / 1024);

          if (isPausedRef.current) {
            pausedChunksRef.current.push(finalBlob);
            return;
          }

          if (isRecordingRef.current && streamRef.current && streamRef.current.active) {
            if (onChunkReady && finalBlob.size > 20000) {
              onChunkReady(finalBlob);
            }
            setTimeout(() => {
              if (isRecordingRef.current && !isPausedRef.current) startNewRecorder();
            }, 100);
          } else {
            const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
            if (finalBlob.size > 20000) {
              onRecordingComplete(finalBlob, duration);
            }
          }
        };

        recorder.start();
        if (chunkIntervalRef.current) clearTimeout(chunkIntervalRef.current);
        chunkIntervalRef.current = setTimeout(() => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }, CHUNK_DURATION);
      };
      
      startNewRecorder();
    }
    
    toast.success("Recording resumed");
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
        isRecordingRef.current = false;
        isPausedRef.current = false;
        if (chunkIntervalRef.current) {
          clearTimeout(chunkIntervalRef.current);
          chunkIntervalRef.current = null;
        }
        if (silenceCheckRef.current) {
          clearInterval(silenceCheckRef.current);
          silenceCheckRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
      }

      setIsRecording(false);
      setIsPaused(false);
      setSilenceTime(0);
      pausedChunksRef.current = [];
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

  const cancelRecording = () => {
    if (!isRecording) return;
    
    isRecordingRef.current = false;
    isPausedRef.current = false;
    
    if (chunkIntervalRef.current) {
      clearTimeout(chunkIntervalRef.current);
      chunkIntervalRef.current = null;
    }
    if (silenceCheckRef.current) {
      clearInterval(silenceCheckRef.current);
      silenceCheckRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Stop recorder without processing
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsRecording(false);
    setIsPaused(false);
    setRecordingTime(0);
    setSilenceTime(0);
    chunksRef.current = [];
    pausedChunksRef.current = [];
    
    onRecordingCancel?.();
    toast.info("Recording cancelled");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-3">
        {/* Main Record/Stop Button */}
        <Button
          onClick={isRecording ? stopRecording : startRecording}
          size="lg"
          variant={isRecording ? "destructive" : "default"}
          className={`h-20 w-20 rounded-full transition-all duration-300 ${
            isRecording && !isPaused
              ? 'animate-pulse shadow-[0_0_40px_rgba(239,68,68,0.5)]' 
              : isRecording && isPaused
              ? 'shadow-[0_0_40px_rgba(234,179,8,0.5)]'
              : 'shadow-[var(--shadow-glow)] hover:scale-110'
          }`}
        >
          {isRecording ? (
            <Square className="h-8 w-8" />
          ) : (
            <Mic className="h-8 w-8" />
          )}
        </Button>

        {/* Pause/Resume Button - only visible while recording */}
        {isRecording && (
          <Button
            onClick={isPaused ? resumeRecording : pauseRecording}
            size="lg"
            variant="outline"
            className={`h-14 w-14 rounded-full transition-all duration-300 ${
              isPaused ? 'border-green-500 text-green-500 hover:bg-green-500/10' : 'border-yellow-500 text-yellow-500 hover:bg-yellow-500/10'
            }`}
          >
            {isPaused ? (
              <Play className="h-6 w-6" />
            ) : (
              <Pause className="h-6 w-6" />
            )}
          </Button>
        )}

        {/* Cancel Button - only visible while recording */}
        {isRecording && (
          <Button
            onClick={cancelRecording}
            size="lg"
            variant="ghost"
            className="h-14 w-14 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <X className="h-6 w-6" />
          </Button>
        )}
      </div>
      
      {isRecording && (
        <div className="text-center space-y-1">
          <p className={`text-2xl font-bold ${isPaused ? 'text-yellow-500' : 'text-primary animate-pulse'}`}>
            {formatTime(recordingTime)}
          </p>
          <p className="text-sm text-muted-foreground">
            {isPaused ? 'Paused' : 'Recording in progress...'}
          </p>
          {silenceTime > 30 && !isPaused && (
            <p className="text-xs text-yellow-500">
              Silence detected: {formatTime(silenceTime)}
              {silenceTime >= 150 && ' (auto-pause in ' + formatTime(180 - silenceTime) + ')'}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
