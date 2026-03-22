"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Search, X, Plus, Mail, RefreshCw } from "lucide-react";
import { applicationStatuses, statusLabels } from "@/lib/schemas";

interface FiltersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  sources: string[];
  showArchived: boolean;
  onShowArchivedChange: (value: boolean) => void;
  onAddNew: () => void;
  onSyncGmail: () => void;
  isSyncing: boolean;
  pendingSuggestions: number;
}

export function FiltersToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sourceFilter,
  onSourceFilterChange,
  sources,
  showArchived,
  onShowArchivedChange,
  onAddNew,
  onSyncGmail,
  isSyncing,
  pendingSuggestions,
}: FiltersToolbarProps) {
  const hasFilters = search || statusFilter || sourceFilter || showArchived;

  function clearFilters() {
    onSearchChange("");
    onStatusFilterChange("");
    onSourceFilterChange("");
    onShowArchivedChange(false);
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search company, role, location..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v ?? "")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {applicationStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabels[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sourceFilter} onValueChange={(v) => onSourceFilterChange(v ?? "")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sources.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          className="h-9"
          onClick={() => onShowArchivedChange(!showArchived)}
        >
          {showArchived ? "Hide Archived" : "Show Archived"}
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-9 relative"
          onClick={onSyncGmail}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-1 h-4 w-4" />
          )}
          {isSyncing ? "Syncing..." : "Sync Gmail"}
          {pendingSuggestions > 0 && !isSyncing && (
            <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground leading-none">
              {pendingSuggestions}
            </span>
          )}
        </Button>

        <Button size="sm" className="h-9" onClick={onAddNew}>
          <Plus className="mr-1 h-4 w-4" />
          Add Application
        </Button>
      </div>
    </div>
  );
}
