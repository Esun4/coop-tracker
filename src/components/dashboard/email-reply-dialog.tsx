"use client";

import { useState, useEffect } from "react";
import { Loader2, Send, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { generateEmailDraft, sendEmailReply } from "@/lib/actions/suggestions";
import type { EmailSuggestion } from "@/generated/prisma/client";

interface EmailReplyDialogProps {
  suggestion: EmailSuggestion;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}

export function EmailReplyDialog({
  suggestion,
  open,
  onOpenChange,
  onSent,
}: EmailReplyDialogProps) {
  const [phase, setPhase] = useState<"loading" | "preview" | "editing" | "sending">("loading");
  const [draftText, setDraftText] = useState("");
  const [editedText, setEditedText] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  useEffect(() => {
    generateEmailDraft(suggestion.id).then((result) => {
      if ("error" in result) {
        setDraftError(result.error ?? "Failed to generate draft");
      } else {
        setDraftText(result.draft);
        setEditedText(result.draft);
        setPhase("preview");
      }
    });
  }, []);

  async function handleSend() {
    setPhase("sending");
    const result = await sendEmailReply(suggestion.id, editedText);
    if ("error" in result && result.error) {
      toast.error(result.error);
      setPhase(draftText !== editedText ? "editing" : "preview");
      return;
    }
    toast.success("Reply sent");
    onSent();
    onOpenChange(false);
  }

  function handleEdit() {
    setPhase("editing");
  }

  function handleSkip() {
    onOpenChange(false);
  }

  const isReady = phase === "preview" || phase === "editing" || phase === "sending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reply to Email</DialogTitle>
        </DialogHeader>

        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">To:</span>{" "}
            {suggestion.emailSender}
          </p>
          <p>
            <span className="font-medium text-foreground">Subject:</span>{" "}
            Re: {suggestion.emailSubject}
          </p>
        </div>

        {phase === "loading" && !draftError && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Drafting reply…
          </div>
        )}

        {draftError && (
          <div className="space-y-3">
            <p className="text-sm text-destructive">{draftError}</p>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        )}

        {isReady && !draftError && (
          <>
            {phase === "preview" ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-sm whitespace-pre-wrap leading-relaxed text-foreground min-h-[9rem]">
                {editedText}
              </div>
            ) : (
              <Textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={6}
                disabled={phase === "sending"}
                className="resize-none text-sm"
                autoFocus
              />
            )}

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEdit}
                disabled={phase === "sending" || phase === "editing"}
                className="text-muted-foreground"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSkip}
                  disabled={phase === "sending"}
                >
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={phase === "sending"}
                >
                  {phase === "sending" ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
