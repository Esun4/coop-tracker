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
import { applicationStatuses, statusLabels } from "@/lib/schemas";
import { createApplication, updateApplication } from "@/lib/actions/applications";
import { toast } from "sonner";
import type { Application } from "@/generated/prisma/client";

interface ApplicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application?: Application | null;
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

export function ApplicationForm({
  open,
  onOpenChange,
  application,
}: ApplicationFormProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!application;

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

    const result = isEditing
      ? await updateApplication(application.id, data)
      : await createApplication(data);

    setLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(
      isEditing ? "Application updated" : "Application added"
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Application" : "Add Application"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">Company *</Label>
              <Input
                id="company"
                name="company"
                required
                defaultValue={application?.company ?? ""}
                placeholder="e.g. Google"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleTitle">Role Title *</Label>
              <Input
                id="roleTitle"
                name="roleTitle"
                required
                defaultValue={application?.roleTitle ?? ""}
                placeholder="e.g. Software Engineer Intern"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                name="status"
                defaultValue={application?.status ?? "APPLYING"}
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
              <Select
                name="source"
                defaultValue={application?.source ?? ""}
              >
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
                defaultValue={application?.location ?? ""}
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
                  application?.applicationDate
                    ? new Date(application.applicationDate)
                        .toISOString()
                        .split("T")[0]
                    : ""
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactInfo">Contact / Recruiter</Label>
            <Input
              id="contactInfo"
              name="contactInfo"
              defaultValue={application?.contactInfo ?? ""}
              placeholder="e.g. Jane Doe - jane@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={application?.notes ?? ""}
              placeholder="Any notes about this application..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
                  ? "Saving..."
                  : "Adding..."
                : isEditing
                ? "Save Changes"
                : "Add Application"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
