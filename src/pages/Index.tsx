import { useState, useEffect } from "react";
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

const Index = () => {
  const [user, setUser] = useState<any>(null);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [accumulatedTranscript, setAccumulatedTranscript] = useState("");
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);

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
          body: { audioBase64: base64Audio }
        });

        if (error) {
          console.error('Transcription error:', error);
          toast.error("Failed to transcribe chunk");
          return;
        }

        if (data?.transcript) {
          console.log('Chunk transcribed:', data.transcript.substring(0, 50));
          const newTranscript = data.transcript;
          const updatedTranscript = accumulatedTranscript + (accumulatedTranscript ? ' ' : '') + newTranscript;
          setAccumulatedTranscript(updatedTranscript);
          
          // If this is the first chunk, create a new meeting
          if (!currentMeetingId) {
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
            const { data: meetingData, error: insertError } = await supabase
              .from('meetings')
              .insert({
                title: `Meeting ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
                transcript: newTranscript,
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

            setCurrentMeetingId(meetingData.id);
            toast.success("First chunk saved!");
            fetchMeetings();
          } else {
            // Update existing meeting with new transcript
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
            const { error: updateError } = await supabase
              .from('meetings')
              .update({
                transcript: updatedTranscript,
                duration_seconds: duration,
                updated_at: new Date().toISOString()
              })
              .eq('id', currentMeetingId);

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
      if (currentMeetingId) {
        // Process final chunk if it has data
        if (audioBlob.size > 0) {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          
          await new Promise<void>((resolve) => {
            reader.onloadend = async () => {
              const base64Audio = (reader.result as string).split(',')[1];
              
              const { data, error } = await supabase.functions.invoke('transcribe-audio', {
                body: { audioBase64: base64Audio }
              });

              if (!error && data?.transcript) {
                const finalTranscript = accumulatedTranscript + (accumulatedTranscript ? ' ' : '') + data.transcript;
                const actualDuration = Math.floor((Date.now() - recordingStartTime) / 1000);
                
                await supabase
                  .from('meetings')
                  .update({
                    transcript: finalTranscript,
                    duration_seconds: actualDuration,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', currentMeetingId);
              }
              resolve();
            };
          });
        }
        
        toast.success("Recording saved!");
        setAccumulatedTranscript("");
        setRecordingStartTime(0);
        setCurrentMeetingId(null);
        fetchMeetings();
      } else {
        // No chunks were processed, handle as before
        toast.info("No transcript captured");
        setAccumulatedTranscript("");
        setRecordingStartTime(0);
      }
    } catch (error) {
      console.error('Error processing recording:', error);
      toast.error("Failed to finalize recording");
      setAccumulatedTranscript("");
      setRecordingStartTime(0);
      setCurrentMeetingId(null);
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
                setRecordingStartTime(Date.now());
                setCurrentMeetingId(null);
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
