"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, ListChecks } from "lucide-react";
import { applicationStatuses, statusLabels } from "@/lib/schemas";
import type { Density } from "./application-table";

interface FiltersToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  sources: string[];
  /** The default view hides closed applications; this is the visible reason. */
  inPlayOnly: boolean;
  onInPlayOnlyChange: (value: boolean) => void;
  density: Density;
  onDensityChange: (value: Density) => void;
  /**
   * The checkbox column only exists while this is on, so entering selection
   * needs one control of its own — there is no checkbox to click first.
   */
  selectionMode: boolean;
  onSelectionModeChange: (value: boolean) => void;
  shown: number;
  total: number;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="bg-secondary flex rounded-md p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`text-micro rounded-sm px-[9px] py-1 transition-colors ${
            value === o.value
              ? "bg-card text-foreground font-medium"
              : "text-muted-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FiltersToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sourceFilter,
  onSourceFilterChange,
  sources,
  inPlayOnly,
  onInPlayOnlyChange,
  density,
  onDensityChange,
  selectionMode,
  onSelectionModeChange,
  shown,
  total,
}: FiltersToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-[11px] size-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search company or role"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="text-meta h-8 w-[280px] pl-[34px]"
          />
        </div>

        {/* The active filter states itself and can be taken off. */}
        {inPlayOnly && (
          <button
            onClick={() => onInPlayOnlyChange(false)}
            className="text-micro bg-chip-3 text-chip-3-foreground inline-flex h-8 items-center gap-1.5 rounded-md px-[11px] font-medium"
          >
            In play
            <X className="size-3" />
          </button>
        )}

        <Select
          value={statusFilter}
          onValueChange={(v) => onStatusFilterChange(v ?? "")}
        >
          <SelectTrigger className="text-meta h-8 w-[110px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {applicationStatuses.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabels[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sourceFilter}
          onValueChange={(v) => onSourceFilterChange(v ?? "")}
        >
          <SelectTrigger className="text-meta h-8 w-[110px]">
            <SelectValue placeholder="Source" />
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
      </div>

      <div className="flex items-center gap-3.5">
        <span className="text-meta text-muted-foreground">
          {shown} of {total}
        </span>
        <button
          onClick={() => onSelectionModeChange(!selectionMode)}
          aria-pressed={selectionMode}
          className={`text-micro inline-flex h-8 items-center gap-1.5 rounded-md border px-[11px] font-medium transition-colors ${
            selectionMode
              ? "border-primary bg-attn text-foreground"
              : "border-border text-muted-foreground hover:bg-secondary"
          }`}
        >
          <ListChecks className="size-3.5" />
          Select
        </button>
        <Segmented<Density>
          label="Table density"
          value={density}
          onChange={onDensityChange}
          options={[
            { value: "compact", label: "Compact" },
            { value: "comfortable", label: "Comfortable" },
          ]}
        />
      </div>
    </div>
  );
}
