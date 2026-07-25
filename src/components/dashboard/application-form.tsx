"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applicationStatuses, statusLabels } from "@/lib/schemas";
import { createApplication, updateApplication } from "@/lib/actions/applications";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Application } from "@/generated/prisma/client";

interface ApplicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application?: Application | null;
  onSuccess?: () => void;
}

const commonSources = [
  "LinkedIn",
  "Company Website",
  "WaterlooWorks",
  "Referral",
  "Indeed",
  "Glassdoor",
  "Handshake",
  "Other",
];

function toDateString(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString().split("T")[0];
  return new Date(d).toISOString().split("T")[0];
}

export function ApplicationForm({
  open,
  onOpenChange,
  application,
  onSuccess,
}: ApplicationFormProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!application;
  // Editing shows everything: the fields are already filled in.
  const [showOptional, setShowOptional] = useState(isEditing);

  const [company, setCompany] = useState(application?.company ?? "");
  const [roleTitle, setRoleTitle] = useState(application?.roleTitle ?? "");
  const [location, setLocation] = useState(application?.location ?? "");
  const [applicationDate, setApplicationDate] = useState(
    toDateString(application?.applicationDate)
  );
  const [status, setStatus] = useState(application?.status ?? "APPLIED");
  const [source, setSource] = useState(application?.source ?? "");
  const [notes, setNotes] = useState(application?.notes ?? "");
  const [contactInfo, setContactInfo] = useState(application?.contactInfo ?? "");

  // Reset all fields whenever the target application changes
  useEffect(() => {
    setCompany(application?.company ?? "");
    setRoleTitle(application?.roleTitle ?? "");
    setLocation(application?.location ?? "");
    setApplicationDate(toDateString(application?.applicationDate));
    // Editing reveals the optional fields; a fresh add folds them away again.
    setShowOptional(!!application);
    setStatus(application?.status ?? "APPLIED");
    setSource(application?.source ?? "");
    setNotes(application?.notes ?? "");
    setContactInfo(application?.contactInfo ?? "");
  }, [application?.id]);

  /** ⌘⏎ / Ctrl+⏎ saves and leaves the dialog open for the next one. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit({ addAnother: !isEditing });
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await submit({ addAnother: false });
  }

  async function submit({ addAnother }: { addAnother: boolean }) {
    setLoading(true);

    const data = {
      company,
      roleTitle,
      location,
      applicationDate,
      status,
      source,
      notes,
      contactInfo,
    };

    const result = isEditing
      ? await updateApplication(application.id, data)
      : await createApplication(data);

    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(isEditing ? "Application updated" : "Application added");
    onSuccess?.();

    if (addAnother) {
      // Stay open, cleared, ready for the next one.
      setCompany("");
      setRoleTitle("");
      setLocation("");
      setContactInfo("");
      setNotes("");
      return;
    }

    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[16.5px] font-semibold">
            {isEditing ? "Edit application" : "Add an application"}
          </DialogTitle>
          {!isEditing && (
            <p className="text-meta text-muted-foreground mt-1">
              Two fields is enough. The rest can wait until you hear back.
            </p>
          )}
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company</Label>
              <Input
                id="company"
                name="company"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Google"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleTitle">Role</Label>
              <Input
                id="roleTitle"
                name="roleTitle"
                required
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g. Software Engineer Intern"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Stage</Label>
              <Select
                name="status"
                value={status}
                onValueChange={(v) => { if (v) setStatus(v); }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {applicationStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicationDate">Applied on</Label>
              <Input
                id="applicationDate"
                name="applicationDate"
                type="date"
                value={applicationDate}
                onChange={(e) => setApplicationDate(e.target.value)}
              />
            </div>
          </div>

          {/* Everything you can fill in later folds behind one row. */}
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            className="border-border-subtle flex w-full items-center gap-2 border-t pt-4 text-left"
          >
            <ChevronRight
              className={`text-muted-foreground size-3.5 transition-transform ${
                showOptional ? "rotate-90" : ""
              }`}
            />
            <span className="text-body font-medium">
              Location, source, contact, notes
            </span>
            <span className="text-meta text-muted-foreground">optional</span>
          </button>

          {showOptional && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    name="location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. San Francisco, CA"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Select
                    name="source"
                    value={source}
                    onValueChange={(v) => { if (v !== null) setSource(v); }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      {commonSources.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactInfo">Contact / recruiter</Label>
                <Input
                  id="contactInfo"
                  name="contactInfo"
                  value={contactInfo}
                  onChange={(e) => setContactInfo(e.target.value)}
                  placeholder="e.g. Jane Doe — jane@company.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes about this application…"
                  rows={3}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-caption text-muted-foreground">
              {isEditing ? "" : "⌘⏎ to save and add another"}
            </span>
            <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? isEditing
                  ? "Saving…"
                  : "Adding…"
                : isEditing
                  ? "Save changes"
                  : "Add application"}
            </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
