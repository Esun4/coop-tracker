"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  ArrowUpDown,
  ArchiveRestore,
} from "lucide-react";
import { statusLabels, statusColors, applicationStatuses, type ApplicationStatusType } from "@/lib/schemas";
import { archiveApplication, deleteApplication, updateApplicationStatus } from "@/lib/actions/applications";
import { ApplicationForm } from "./application-form";
import { toast } from "sonner";
import type { Application } from "@/generated/prisma/client";

interface ApplicationTableProps {
  applications: Application[];
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (column: string) => void;
  onUpdate?: () => void;
}

function InlineStatusSelect({
  application,
  onUpdate,
}: {
  application: Application;
  onUpdate?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleStatusChange(newStatus: string) {
    if (newStatus === application.status) return;
    setLoading(true);
    const result = await updateApplicationStatus(application.id, newStatus);
    setLoading(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onUpdate?.();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-75 ${
              statusColors[application.status as ApplicationStatusType] ?? ""
            }`}
            disabled={loading}
          >
            {loading ? "…" : statusLabels[application.status as ApplicationStatusType]}
          </button>
        }
      />
      <DropdownMenuContent>
        {applicationStatuses.map((status) => (
          <DropdownMenuItem
            key={status}
            onClick={() => handleStatusChange(status)}
            className={application.status === status ? "font-semibold" : ""}
          >
            <span
              className={`mr-2 inline-block h-2 w-2 rounded-full ${
                statusColors[status]?.split(" ")[0] ?? ""
              }`}
            />
            {statusLabels[status]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ApplicationTable({
  applications,
  sortBy,
  sortOrder,
  onSort,
  onUpdate,
}: ApplicationTableProps) {
  const [editApp, setEditApp] = useState<Application | null>(null);

  async function handleArchive(id: string) {
    const result = await archiveApplication(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Application updated");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this application?")) return;
    const result = await deleteApplication(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("Application deleted");
    }
  }

  function SortHeader({ column, children }: { column: string; children: React.ReactNode }) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8"
        onClick={() => onSort(column)}
      >
        {children}
        <ArrowUpDown className="ml-1 h-3 w-3" />
        {sortBy === column && (
          <span className="ml-1 text-xs">{sortOrder === "asc" ? "↑" : "↓"}</span>
        )}
      </Button>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">No applications yet</p>
        <p className="text-sm mt-1">Add your first application to get started.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader column="company">Company</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader column="roleTitle">Role</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader column="status">Status</SortHeader>
              </TableHead>
              <TableHead>
                <SortHeader column="applicationDate">Date</SortHeader>
              </TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app) => (
              <TableRow
                key={app.id}
                className={app.archived ? "opacity-50" : undefined}
              >
                <TableCell className="font-medium">{app.company}</TableCell>
                <TableCell>{app.roleTitle}</TableCell>
                <TableCell>
                  <InlineStatusSelect application={app} onUpdate={onUpdate} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {app.applicationDate
                    ? new Date(app.applicationDate).toLocaleDateString()
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {app.location || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {app.source || "—"}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditApp(app)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(app.id)}>
                        {app.archived ? (
                          <>
                            <ArchiveRestore className="mr-2 h-4 w-4" />
                            Unarchive
                          </>
                        ) : (
                          <>
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(app.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ApplicationForm
        open={!!editApp}
        onOpenChange={(open) => {
          if (!open) setEditApp(null);
        }}
        application={editApp}
        onSuccess={onUpdate}
      />
    </>
  );
}
