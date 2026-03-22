"use client";

import { useState } from "react";
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
import { ChevronDown, ChevronRight, Mail, X, Check } from "lucide-react";
import {
  applicationStatuses,
  statusLabels,
  statusColors,
} from "@/lib/schemas";
import {
  dismissSuggestion,
  acceptNewApplication,
  acceptStatusUpdate,
} from "@/lib/actions/suggestions";
import { toast } from "sonner";
import type { Application, EmailSuggestion } from "@/generated/prisma/client";

interface EmailSuggestionsSectionProps {
  suggestions: EmailSuggestion[];
  applications: Application[];
  onResolved: () => void;
}

const actionLabels: Record<string, string> = {
  NEW_APPLICATION: "New Application",
  STATUS_UPDATE: "Status Update",
};

const actionColors: Record<string, string> = {
  NEW_APPLICATION: "bg-blue-100 text-blue-800",
  STATUS_UPDATE: "bg-amber-100 text-amber-800",
};

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

function NewApplicationDialog({
  suggestion,
  onClose,
  onResolved,
}: {
  suggestion: EmailSuggestion;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      company: formData.get("company") as string,
      roleTitle: formData.get("roleTitle") as string,
      location: formData.get("location") as string,
      applicationDate: formData.get("applicationDate") as string,
      status: formData.get("status") as string,
      source: formData.get("source") as string,
      notes: formData.get("notes") as string,
      contactInfo: formData.get("contactInfo") as string,
    };

    const result = await acceptNewApplication(suggestion.id, data);
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Application added");
    onClose();
    onResolved();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Confirm New Application</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1 mb-2">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">From:</span>{" "}
            {suggestion.emailSender}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Subject:</span>{" "}
            {suggestion.emailSubject}
          </p>
          {suggestion.reasoning && (
            <p className="text-muted-foreground italic">{suggestion.reasoning}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company *</Label>
              <Input
                id="company"
                name="company"
                required
                defaultValue={suggestion.suggestedCompany ?? ""}
                placeholder="e.g. Google"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleTitle">Role Title *</Label>
              <Input
                id="roleTitle"
                name="roleTitle"
                required
                defaultValue={suggestion.suggestedRole ?? ""}
                placeholder="e.g. Software Engineer Intern"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                name="status"
                defaultValue={suggestion.suggestedStatus ?? "APPLIED"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {applicationStatuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Select name="source" defaultValue="">
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {commonSources.map((source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                name="location"
                placeholder="e.g. San Francisco, CA"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicationDate">Application Date</Label>
              <Input
                id="applicationDate"
                name="applicationDate"
                type="date"
                defaultValue={
                  suggestion.emailDate
                    ? new Date(suggestion.emailDate).toISOString().split("T")[0]
                    : new Date().toISOString().split("T")[0]
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactInfo">Contact / Recruiter</Label>
            <Input
              id="contactInfo"
              name="contactInfo"
              placeholder="e.g. Jane Doe - jane@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Any notes about this application..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Application"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusUpdateDialog({
  suggestion,
  applications,
  onClose,
  onResolved,
}: {
  suggestion: EmailSuggestion;
  applications: Application[];
  onClose: () => void;
  onResolved: () => void;
}) {
  const [loading, setLoading] = useState(false);

  // Pre-match by company name (case-insensitive)
  const matchedApp = applications.find(
    (a) =>
      suggestion.suggestedCompany &&
      a.company.toLowerCase() === suggestion.suggestedCompany.toLowerCase()
  );

  const [selectedAppId, setSelectedAppId] = useState(matchedApp?.id ?? "");
  const [selectedStatus, setSelectedStatus] = useState(
    suggestion.suggestedStatus ?? "REJECTED"
  );

  async function handleAccept() {
    if (!selectedAppId) {
      toast.error("Please select an application to update");
      return;
    }
    setLoading(true);
    const result = await acceptStatusUpdate(
      suggestion.id,
      selectedAppId,
      selectedStatus
    );
    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Application status updated");
    onClose();
    onResolved();
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Status Update</DialogTitle>
        </DialogHeader>

        <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1 mb-2">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">From:</span>{" "}
            {suggestion.emailSender}
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Subject:</span>{" "}
            {suggestion.emailSubject}
          </p>
          {suggestion.reasoning && (
            <p className="text-muted-foreground italic">{suggestion.reasoning}</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Application</Label>
            <Select
              value={selectedAppId}
              onValueChange={(v) => { if (v) setSelectedAppId(v); }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select application to update" />
              </SelectTrigger>
              <SelectContent>
                {applications
                  .filter((a) => !a.archived)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.company} — {a.roleTitle}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>New Status</Label>
            <Select
              value={selectedStatus}
              onValueChange={(v) => { if (v) setSelectedStatus(v); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {applicationStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {statusLabels[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={loading || !selectedAppId}>
            {loading ? "Updating..." : "Update Status"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EmailSuggestionsSection({
  suggestions,
  applications,
  onResolved,
}: EmailSuggestionsSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [accepting, setAccepting] = useState<EmailSuggestion | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  async function handleDismiss(id: string) {
    setDismissing(id);
    const result = await dismissSuggestion(id);
    setDismissing(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onResolved();
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors rounded-lg"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <Mail className="h-4 w-4 text-muted-foreground" />
        <span>Email Suggestions</span>
        <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
          {suggestions.length}
        </span>
      </button>

      {!collapsed && (
        <div className="border-t">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="px-4 py-2 text-left font-medium">Action</th>
                  <th className="px-4 py-2 text-left font-medium">Company</th>
                  <th className="px-4 py-2 text-left font-medium">Role</th>
                  <th className="px-4 py-2 text-left font-medium">Confidence</th>
                  <th className="px-4 py-2 text-left font-medium">Subject</th>
                  <th className="px-4 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          actionColors[s.suggestedAction] ?? ""
                        }`}
                      >
                        {actionLabels[s.suggestedAction] ?? s.suggestedAction}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {s.suggestedCompany ?? (
                        <span className="text-muted-foreground italic">Unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {s.suggestedRole ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.round(s.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(s.confidence * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {s.emailSubject}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => setAccepting(s)}
                          title="Accept"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDismiss(s.id)}
                          disabled={dismissing === s.id}
                          title="Dismiss"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {accepting && accepting.suggestedAction === "NEW_APPLICATION" && (
        <NewApplicationDialog
          suggestion={accepting}
          onClose={() => setAccepting(null)}
          onResolved={onResolved}
        />
      )}

      {accepting && accepting.suggestedAction === "STATUS_UPDATE" && (
        <StatusUpdateDialog
          suggestion={accepting}
          applications={applications}
          onClose={() => setAccepting(null)}
          onResolved={onResolved}
        />
      )}
    </div>
  );
}
