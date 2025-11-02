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
  summary: string | null;
  duration_seconds: number;
  created_at: string;
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

  const handleGenerateSummary = async () => {
    const transcriptToSummarize = meeting.translated_transcript || meeting.transcript;
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
        {(meeting.translated_transcript || meeting.transcript) && (
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
                const displayTranscript = showOriginal ? meeting.transcript : (meeting.translated_transcript || meeting.transcript);
                if (!displayTranscript) return '';
                return showFullTranscript ? displayTranscript : displayTranscript.slice(0, 200);
              })()}
              {(() => {
                const displayTranscript = showOriginal ? meeting.transcript : (meeting.translated_transcript || meeting.transcript);
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
            <p className="text-sm whitespace-pre-wrap">{meeting.summary}</p>
          </div>
        )}

        {meeting.transcript && !meeting.summary && (
          <Button
            onClick={handleGenerateSummary}
            disabled={isGeneratingSummary}
            className="w-full"
            variant="outline"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGeneratingSummary ? 'Generating Summary...' : 'Generate AI Summary'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
