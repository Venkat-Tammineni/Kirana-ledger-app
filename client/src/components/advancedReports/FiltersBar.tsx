import { Download, FileText, MessageCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AdvancedPreset = "today" | "week" | "month" | "quarter" | "financialYear" | "custom";
export type AdvancedGranularity = "day" | "week" | "month";
export type SortDirection = "asc" | "desc";

type FiltersBarProps = {
  preset: AdvancedPreset;
  onPresetChange: (value: AdvancedPreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  granularity: AdvancedGranularity;
  onGranularityChange: (value: AdvancedGranularity) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sortDirection: SortDirection;
  onSortDirectionChange: (value: SortDirection) => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
  onShare: () => void;
};

const PRESETS: Array<{ value: AdvancedPreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "financialYear", label: "Financial Year" },
  { value: "custom", label: "Custom Range" },
];

export function FiltersBar(props: FiltersBarProps) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.value}
              size="sm"
              variant={props.preset === preset.value ? "default" : "outline"}
              onClick={() => props.onPresetChange(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_180px_180px_140px_140px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              placeholder="Search current report..."
              className="pl-9"
            />
          </div>

          <Input
            type="date"
            value={props.customStart}
            onChange={(event) => props.onCustomStartChange(event.target.value)}
            disabled={props.preset !== "custom"}
          />

          <Input
            type="date"
            value={props.customEnd}
            onChange={(event) => props.onCustomEndChange(event.target.value)}
            disabled={props.preset !== "custom"}
          />

          <Select value={props.granularity} onValueChange={(value) => props.onGranularityChange(value as AdvancedGranularity)}>
            <SelectTrigger>
              <SelectValue placeholder="Granularity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>

          <Select value={props.sortDirection} onValueChange={(value) => props.onSortDirectionChange(value as SortDirection)}>
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">DESC</SelectItem>
              <SelectItem value="asc">ASC</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={props.onExportCsv}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={props.onExportPdf}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" size="sm" onClick={props.onShare}>
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
