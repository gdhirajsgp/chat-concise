import { useState } from "react";
import { FileText, Sparkles, Trash2, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Meeting {
  id: string;
  title: string;
  transcript: string | null;
  translated_transcript: string | null;
  formatted_transcript: string | null;
  summary: string | null;
  duration_seconds: number;
  created_at: string;
  speaker_mappings: Record<string, string> | null;
  diarized_segments: any[] | null;
  audio_length_seconds: number | null;
  transcription_time_ms: number | null;
}

interface MeetingCardProps {
  meeting: Meeting;
  onDelete: () => void;
  onSummaryGenerated: () => void;
}

export const MeetingCard = ({ meeting, onDelete, onSummaryGenerated }: MeetingCardProps) => {
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [speakerMappings, setSpeakerMappings] = useState<Record<string, string>>(meeting.speaker_mappings || {});
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleGenerateSummary = async () => {
    // Use formatted transcript with speaker labels if available
    const transcriptToSummarize = meeting.formatted_transcript || meeting.translated_transcript || meeting.transcript;
    if (!transcriptToSummarize) {
      toast.error("No transcript available to summarize");
      return;
    }

    setIsGeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('summarize-meeting', {
        body: { transcript: transcriptToSummarize }
      });

      if (error) throw error;

      await supabase
        .from('meetings')
        .update({ summary: data.summary })
        .eq('id', meeting.id);

      toast.success("Summary generated successfully");
      onSummaryGenerated();
    } catch (error) {
      console.error('Error generating summary:', error);
      toast.error("Failed to generate summary");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleRenameSpeaker = async (speakerId: string, newName: string) => {
    const updatedMappings = { ...speakerMappings, [speakerId]: newName };
    setSpeakerMappings(updatedMappings);
    
    try {
      await supabase
        .from('meetings')
        .update({ speaker_mappings: updatedMappings })
        .eq('id', meeting.id);
      
      toast.success("Speaker renamed");
      onSummaryGenerated(); // Refresh to show updated names
    } catch (error) {
      console.error('Error renaming speaker:', error);
      toast.error("Failed to rename speaker");
    }
    
    setEditingSpeaker(null);
    setEditValue('');
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase
        .from('meetings')
        .delete()
        .eq('id', meeting.id);

      if (error) throw error;

      toast.success("Meeting deleted");
      onDelete();
    } catch (error) {
      console.error('Error deleting meeting:', error);
      toast.error("Failed to delete meeting");
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Card className="hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-card to-card/80 border-border/50">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl mb-2">{meeting.title}</CardTitle>
            <CardDescription className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDistanceToNow(new Date(meeting.created_at), { addSuffix: true })}
              </span>
              <span>{formatDuration(meeting.duration_seconds)}</span>
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive/80"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Speaker Mappings */}
        {meeting.speaker_mappings && Object.keys(meeting.speaker_mappings).length > 0 && (
          <div className="bg-secondary/20 p-3 rounded-lg">
            <h4 className="font-semibold text-sm mb-2">Speakers</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(speakerMappings).map(([speakerId, speakerName]) => (
                <div key={speakerId} className="flex items-center gap-2">
                  {editingSpeaker === speakerId ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSpeaker(speakerId, editValue);
                          if (e.key === 'Escape') { setEditingSpeaker(null); setEditValue(''); }
                        }}
                        className="text-xs px-2 py-1 border rounded w-24"
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleRenameSpeaker(speakerId, editValue)} className="h-6 px-2">
                        ✓
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setEditingSpeaker(speakerId); setEditValue(speakerName); }}
                      className="text-xs h-7"
                    >
                      {speakerName} ✏️
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(meeting.formatted_transcript || meeting.translated_transcript || meeting.transcript) && (
          <div>
            <div className="flex items-center gap-2 mb-2 justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h4 className="font-semibold">
                  {showOriginal ? "Original Transcript" : "Transcript (English)"}
                </h4>
              </div>
              {meeting.transcript && meeting.translated_transcript && meeting.transcript !== meeting.translated_transcript && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOriginal(!showOriginal)}
                  className="text-xs"
                >
                  {showOriginal ? "Show English" : "Show Original"}
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {(() => {
                const displayTranscript = showOriginal 
                  ? meeting.transcript 
                  : (meeting.formatted_transcript || meeting.translated_transcript || meeting.transcript);
                if (!displayTranscript) return '';
                return showFullTranscript ? displayTranscript : displayTranscript.slice(0, 200);
              })()}
              {(() => {
                const displayTranscript = showOriginal 
                  ? meeting.transcript 
                  : (meeting.formatted_transcript || meeting.translated_transcript || meeting.transcript);
                return displayTranscript && displayTranscript.length > 200 && (
                  <button
                    onClick={() => setShowFullTranscript(!showFullTranscript)}
                    className="ml-2 text-primary hover:underline"
                  >
                    {showFullTranscript ? 'Show less' : 'Show more'}
                  </button>
                );
              })()}
            </p>
          </div>
        )}

        {meeting.summary && (
          <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h4 className="font-semibold text-primary">AI Summary</h4>
            </div>
            <div className="text-sm whitespace-pre-wrap prose prose-sm max-w-none">
              {meeting.summary.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {/* Performance metrics */}
        {meeting.audio_length_seconds && meeting.transcription_time_ms && (
          <div className="text-xs text-muted-foreground">
            Transcription: {meeting.audio_length_seconds}s audio processed in {meeting.transcription_time_ms}ms
          </div>
        )}

        {meeting.transcript && (
          <Button
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
            className="w-full"
            variant="outline"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGeneratingSummary ? 'Generating Summary...' : meeting.summary ? 'Regenerate AI Summary' : 'Generate AI Summary'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
