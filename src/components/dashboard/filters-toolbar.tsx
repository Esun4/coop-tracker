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
import { Search, X } from "lucide-react";
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
}: FiltersToolbarProps) {
  const hasFilters = search || statusFilter || sourceFilter || showArchived;

  function clearFilters() {
    onSearchChange("");
    onStatusFilterChange("");
    onSourceFilterChange("");
    onShowArchivedChange(false);
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2.5">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search company, role, location…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v ?? "")}>
          <SelectTrigger className="h-9 w-[138px] text-sm">
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
          <SelectTrigger className="h-9 w-[130px] text-sm">
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
          className="h-9 text-xs"
          onClick={() => onShowArchivedChange(!showArchived)}
        >
          {showArchived ? "Hide Archived" : "Archived"}
        </Button>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={clearFilters}>
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
