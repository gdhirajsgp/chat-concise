import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Auth } from "@/components/Auth";
import { RecordingButton } from "@/components/RecordingButton";
import { MeetingCard } from "@/components/MeetingCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mic2, Plus, LogOut, FileText } from "lucide-react";
import { z } from "zod";

const meetingInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be less than 200 characters'),
  transcript: z.string().trim().min(1, 'Transcript is required').max(100000, 'Transcript must be less than 100,000 characters')
});

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
  const accumulatedTranscriptRef = useRef<string>("");
  const accumulatedTranslatedTranscriptRef = useRef<string>("");
  const currentMeetingIdRef = useRef<string | null>(null);

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
    // Validate input
    const result = meetingInputSchema.safeParse({ 
      title: manualTitle, 
      transcript: manualTranscript 
    });
    
    if (!result.success) {
      toast.error(result.error.errors[0].message);
      return;
    }

    try {
      const { error } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          title: result.data.title,
          transcript: result.data.transcript,
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
              onRecordingComplete={handleRecordingComplete}
              onChunkReady={handleChunkReady}
              onRecordingStart={() => {
                setIsProcessing(false);
                setAccumulatedTranscript("");
                setAccumulatedTranslatedTranscript("");
                accumulatedTranscriptRef.current = "";
                accumulatedTranslatedTranscriptRef.current = "";
                setRecordingStartTime(Date.now());
                currentMeetingIdRef.current = null;
                toast.info("Recording started - transcribing in 30s chunks");
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
                    maxLength={200}
                  />
                  <Textarea
                    placeholder="Enter your meeting notes here..."
                    value={manualTranscript}
                    onChange={(e) => setManualTranscript(e.target.value)}
                    rows={8}
                    maxLength={100000}
                  />
                  <Button onClick={handleManualSubmit} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Save Notes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

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
