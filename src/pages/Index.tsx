import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Auth } from "@/components/Auth";
import { RecordingButton } from "@/components/RecordingButton";
import { MeetingCard } from "@/components/MeetingCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Mic2, Plus, LogOut, FileText, ChevronDown, Sparkles } from "lucide-react";
import { useDeviceType } from "@/hooks/useDeviceType";
import { openRecordingWindows, closeRecordingWindows } from "@/lib/windowManager";
import { useBroadcastChannel, BroadcastMessage } from "@/hooks/useBroadcastChannel";

const Index = () => {
  const [user, setUser] = useState<any>(null);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [accumulatedTranscript, setAccumulatedTranscript] = useState("");
  const [accumulatedTranslatedTranscript, setAccumulatedTranslatedTranscript] = useState("");
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [currentMeetingSummary, setCurrentMeetingSummary] = useState("");
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [isSoftMinimized, setIsSoftMinimized] = useState(false);
  const [popupsBlocked, setPopupsBlocked] = useState(false);
  const accumulatedTranscriptRef = useRef<string>("");
  const accumulatedTranslatedTranscriptRef = useRef<string>("");
  const currentMeetingIdRef = useRef<string | null>(null);
  const { isDesktop, isMobile } = useDeviceType();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchMeetings();
    }
  }, [user]);

  const { postMessage } = useBroadcastChannel('recording-channel', (message: BroadcastMessage) => {
    if (message.type === 'recording-stop') {
      // Trigger stop from control window
      setIsProcessing(false);
    } else if (message.type === 'summary-update' && message.payload?.action === 'request') {
      handleGenerateCurrentSummary();
    } else if (message.type === 'ensure-windows') {
      handleRetryOpenWindows();
    } else if (message.type === 'bring-main') {
      window.focus();
      setIsSoftMinimized(false);
    }
  });

  const fetchMeetings = async () => {
    const { data, error } = await supabase
      .from('meetings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching meetings:', error);
      return;
    }

    setMeetings(data || []);
  };

  const handleChunkReady = async (audioBlob: Blob) => {
    try {
      console.log('Processing chunk, size:', audioBlob.size);
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        console.log('Sending chunk for transcription...');
          const { data, error } = await supabase.functions.invoke('transcribe-audio', {
            body: { audioBase64: base64Audio, mimeType: (audioBlob.type?.split(';')[0] || 'audio/webm') }
          });

        if (error) {
          console.error('Transcription error:', error);
          toast.error("Failed to transcribe chunk");
          return;
        }

        if (data?.transcript) {
          console.log('Chunk transcribed:', data.transcript.substring(0, 50));
          const newTranscript = data.transcript.trim();
          const newTranslatedTranscript = (data.translatedTranscript || data.transcript).trim();
          
          const prev = accumulatedTranscriptRef.current;
          const prevTranslated = accumulatedTranslatedTranscriptRef.current;
          
          const updatedTranscript = prev ? `${prev} ${newTranscript}` : newTranscript;
          const updatedTranslatedTranscript = prevTranslated ? `${prevTranslated} ${newTranslatedTranscript}` : newTranslatedTranscript;
          
          accumulatedTranscriptRef.current = updatedTranscript;
          accumulatedTranslatedTranscriptRef.current = updatedTranslatedTranscript;
          setAccumulatedTranscript(updatedTranscript);
          setAccumulatedTranslatedTranscript(updatedTranslatedTranscript);
          
          // Broadcast to desktop windows
          if (isDesktop) {
            postMessage({
              type: 'transcript-update',
              payload: { text: updatedTranslatedTranscript, original: updatedTranscript }
            });
          }
          
          // If this is the first chunk, create a new meeting
          if (!currentMeetingIdRef.current) {
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
            const { data: meetingData, error: insertError } = await supabase
              .from('meetings')
              .insert({
                title: `Meeting ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                transcript: updatedTranscript,
                translated_transcript: updatedTranslatedTranscript,
                duration_seconds: duration,
                user_id: user?.id
              })
              .select()
              .single();

            if (insertError) {
              console.error('Failed to create meeting:', insertError);
              toast.error("Failed to save meeting");
              return;
            }

            currentMeetingIdRef.current = meetingData.id;
            toast.success("First chunk saved!");
            fetchMeetings();
          } else {
            // Update existing meeting with new transcript
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
            const { error: updateError } = await supabase
              .from('meetings')
              .update({
                transcript: updatedTranscript,
                translated_transcript: updatedTranslatedTranscript,
                duration_seconds: duration,
                updated_at: new Date().toISOString()
              })
              .eq('id', currentMeetingIdRef.current);

            if (updateError) {
              console.error('Failed to update meeting:', updateError);
              toast.error("Failed to update transcript");
              return;
            }

            toast.success("Chunk appended");
            fetchMeetings();
          }
        }
      };
    } catch (error) {
      console.error('Error processing chunk:', error);
      toast.error("Failed to process chunk");
    }
  };

  const handleRecordingComplete = async (audioBlob: Blob, duration: number) => {
    setIsProcessing(true);
    try {
      console.log('Recording complete, processing final chunk');
      
      // If we have a meeting ID, just finalize it
      if (currentMeetingIdRef.current) {
        // Process final chunk if it has data
        if (audioBlob.size > 0) {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          
          await new Promise<void>((resolve) => {
            reader.onloadend = async () => {
              const base64Audio = (reader.result as string).split(',')[1];
              
              const { data, error } = await supabase.functions.invoke('transcribe-audio', {
                body: { audioBase64: base64Audio, mimeType: (audioBlob.type?.split(';')[0] || 'audio/webm') }
              });

              if (!error && data?.transcript) {
                const prev = accumulatedTranscriptRef.current;
                const prevTranslated = accumulatedTranslatedTranscriptRef.current;
                const finalTranscript = prev ? `${prev} ${data.transcript}` : data.transcript;
                const finalTranslatedTranscript = prevTranslated ? `${prevTranslated} ${(data.translatedTranscript || data.transcript)}` : (data.translatedTranscript || data.transcript);
                const actualDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
                
                await supabase
                  .from('meetings')
                  .update({
                    transcript: finalTranscript,
                    translated_transcript: finalTranslatedTranscript,
                    duration_seconds: actualDuration,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', currentMeetingIdRef.current);
              }
              resolve();
            };
          });
        }
        
        toast.success("Recording saved!");
        setAccumulatedTranscript("");
        setAccumulatedTranslatedTranscript("");
        accumulatedTranscriptRef.current = "";
        accumulatedTranslatedTranscriptRef.current = "";
        setRecordingStartTime(0);
        currentMeetingIdRef.current = null;
        fetchMeetings();
      } else {
        // No chunks were processed or first chunk failed — transcribe final blob and save as a meeting
        if (audioBlob.size > 0) {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);

          await new Promise<void>((resolve) => {
            reader.onloadend = async () => {
              try {
                const base64Audio = (reader.result as string).split(',')[1];
                  const { data, error } = await supabase.functions.invoke('transcribe-audio', {
                    body: { audioBase64: base64Audio, mimeType: (audioBlob.type?.split(';')[0] || 'audio/webm') }
                  });

                if (error) {
                  console.error('Final transcription error:', error);
                  toast.error('Failed to transcribe final audio');
                } else if (data?.transcript) {
                  const actualDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
                  const { error: insertError } = await supabase
                    .from('meetings')
                    .insert({
                      title: `Meeting ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                      transcript: data.transcript,
                      duration_seconds: actualDuration,
                      user_id: user?.id,
                    });

                  if (insertError) {
                    console.error('Failed to save meeting:', insertError);
                    toast.error('Failed to save meeting');
                  } else {
                    toast.success('Recording saved!');
                    fetchMeetings();
                  }
                } else {
                  toast.info('No transcript captured');
                }
              } catch (e) {
                console.error('Error handling final transcription:', e);
                toast.error('Error processing final transcription');
              } finally {
                resolve();
              }
            };
          });
        } else {
          toast.info('No audio captured');
        }
        setAccumulatedTranscript("");
        setAccumulatedTranslatedTranscript("");
        accumulatedTranscriptRef.current = "";
        accumulatedTranslatedTranscriptRef.current = "";
        setRecordingStartTime(0);
        currentMeetingIdRef.current = null;
      }
    } catch (error) {
      console.error('Error processing recording:', error);
      toast.error("Failed to finalize recording");
      setAccumulatedTranscript("");
      setAccumulatedTranslatedTranscript("");
      accumulatedTranscriptRef.current = "";
      accumulatedTranslatedTranscriptRef.current = "";
      setRecordingStartTime(0);
      currentMeetingIdRef.current = null;
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualTitle || !manualTranscript) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      const { error } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          title: manualTitle,
          transcript: manualTranscript,
          duration_seconds: 0,
        });

      if (error) throw error;

      toast.success("Meeting notes saved!");
      setShowManualDialog(false);
      setManualTitle("");
      setManualTranscript("");
      fetchMeetings();
    } catch (error) {
      console.error('Error saving manual notes:', error);
      toast.error("Failed to save notes");
    }
  };

  const handleGenerateCurrentSummary = async () => {
    if (!currentMeetingIdRef.current || !accumulatedTranslatedTranscriptRef.current) {
      toast.error("No active recording to summarize");
      return;
    }

    setGeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('summarize-meeting', {
        body: { transcript: accumulatedTranslatedTranscriptRef.current }
      });

      if (error) throw error;

      const summary = data.summary;
      setCurrentMeetingSummary(summary);
      
      // Update the meeting record
      await supabase
        .from('meetings')
        .update({ summary })
        .eq('id', currentMeetingIdRef.current);

      // Broadcast to desktop windows
      if (isDesktop) {
        postMessage({
          type: 'summary-update',
          payload: { summary }
        });
      }

      toast.success("Summary generated!");
    } catch (error) {
      console.error('Error generating summary:', error);
      toast.error("Failed to generate summary");
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleRetryOpenWindows = () => {
    const { openRecordingWindows: ensureWindowsOpen } = require('@/lib/windowManager');
    const refs = ensureWindowsOpen();
    const hasBlocked = !refs.control || !refs.transcript || !refs.summary;
    setPopupsBlocked(hasBlocked);
    if (!hasBlocked) {
      toast.success("All windows opened!");
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  // Soft-minimized state during desktop recording
  if (isSoftMinimized && isDesktop) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background flex items-center justify-center">
        <div className="max-w-md mx-auto text-center space-y-6 p-8">
          <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary-glow rounded-full flex items-center justify-center mx-auto shadow-[var(--shadow-glow)] animate-pulse">
            <Mic2 className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold">Recording in Progress</h2>
          <p className="text-muted-foreground">
            Your recording is being transcribed in separate windows. Check the Control window to manage your recording.
          </p>
          {popupsBlocked && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive mb-2">
                Some windows were blocked. Please enable pop-ups for this site.
              </p>
              <Button onClick={handleRetryOpenWindows} variant="outline" size="sm">
                Try Again
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-background">
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary-glow rounded-xl flex items-center justify-center shadow-[var(--shadow-glow)]">
              <Mic2 className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              MeetingMind
            </h1>
          </div>
          <Button onClick={handleSignOut} variant="ghost" size="sm">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Recording Section */}
          <div className="text-center space-y-6 py-8">
            <h2 className="text-3xl font-bold">Record Your Meeting</h2>
            <RecordingButton 
              onRecordingComplete={async (blob, duration) => {
                await handleRecordingComplete(blob, duration);
                
                if (isDesktop) {
                  // Auto-generate summary if we have transcript
                  if (currentMeetingIdRef.current && accumulatedTranslatedTranscriptRef.current && !currentMeetingSummary) {
                    try {
                      const { data } = await supabase.functions.invoke('summarize-meeting', {
                        body: { transcript: accumulatedTranslatedTranscriptRef.current }
                      });
                      if (data?.summary) {
                        await supabase
                          .from('meetings')
                          .update({ summary: data.summary })
                          .eq('id', currentMeetingIdRef.current);
                        postMessage({
                          type: 'summary-update',
                          payload: { summary: data.summary }
                        });
                      }
                    } catch (error) {
                      console.error('Auto-summary failed:', error);
                    }
                  }
                  
                  closeRecordingWindows();
                  postMessage({ type: 'recording-stop' });
                  postMessage({ type: 'bring-main' });
                  setIsSoftMinimized(false);
                  window.focus();
                  fetchMeetings();
                  toast.success("Recording saved! Transcript and summary ready.");
                }
              }}
              onChunkReady={handleChunkReady}
              onRecordingStart={() => {
                setIsProcessing(false);
                setAccumulatedTranscript("");
                setAccumulatedTranslatedTranscript("");
                setCurrentMeetingSummary("");
                accumulatedTranscriptRef.current = "";
                accumulatedTranslatedTranscriptRef.current = "";
                setRecordingStartTime(Date.now());
                currentMeetingIdRef.current = null;
                
                if (isDesktop) {
                  const refs = openRecordingWindows();
                  const hasBlocked = !refs.control || !refs.transcript || !refs.summary;
                  setPopupsBlocked(hasBlocked);
                  
                  if (hasBlocked) {
                    toast.error("Some windows were blocked. Please enable pop-ups and click 'Try Again' in the recording screen.", {
                      duration: 5000,
                    });
                  } else {
                    toast.success("Recording windows opened!");
                  }
                  
                  postMessage({ type: 'recording-start' });
                  setIsSoftMinimized(true);
                } else {
                  toast.info("Recording started - transcribing in 30s chunks");
                  setTranscriptOpen(true);
                }
              }}
            />
            {isProcessing && (
              <p className="text-muted-foreground animate-pulse">
                Processing recording and generating transcript...
              </p>
            )}
            
            <Dialog open={showManualDialog} onOpenChange={setShowManualDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="lg" className="mt-4">
                  <FileText className="h-5 w-5 mr-2" />
                  Add Manual Notes
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Meeting Notes Manually</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="Meeting title"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                  />
                  <Textarea
                    placeholder="Enter your meeting notes here..."
                    value={manualTranscript}
                    onChange={(e) => setManualTranscript(e.target.value)}
                    rows={8}
                  />
                  <Button onClick={handleManualSubmit} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Save Notes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Mobile Live Transcript & Summary */}
          {!isDesktop && accumulatedTranslatedTranscript && (
            <div className="space-y-4">
              <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Live Transcript
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${transcriptOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-4 bg-card rounded-lg border border-border max-h-64 overflow-y-auto">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {accumulatedTranslatedTranscript}
                    </p>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={summaryOpen} onOpenChange={setSummaryOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      AI Summary
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${summaryOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-4 bg-card rounded-lg border border-border">
                    {currentMeetingSummary ? (
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {currentMeetingSummary}
                      </p>
                    ) : (
                      <Button
                        onClick={handleGenerateCurrentSummary}
                        disabled={generatingSummary}
                        className="w-full"
                      >
                        {generatingSummary ? "Generating..." : "Generate AI Summary"}
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* Meetings List */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Your Meetings</h2>
            {meetings.length === 0 ? (
              <div className="p-8 text-center bg-card rounded-lg border border-border">
                <p className="text-muted-foreground">No meetings yet. Start by recording your first one!</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {meetings.map((meeting) => (
                  <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    onDelete={fetchMeetings}
                    onSummaryGenerated={fetchMeetings}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
