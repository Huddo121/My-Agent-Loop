import type { AgentHarnessId } from "@mono/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export type HarnessSelectValue = AgentHarnessId | null;

export type HarnessSelectProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  harnesses: Array<{ id: string; displayName: string; isAvailable: boolean }>;
  isLoading?: boolean;
  disabled?: boolean;
  inheritDisplayName: string;
  inheritLabel?: string;
  placeholder?: string;
};

export function HarnessSelect({
  id,
  value,
  onValueChange,
  harnesses,
  isLoading = false,
  disabled = false,
  inheritDisplayName,
  inheritLabel = "Inherit",
  placeholder = "Loading…",
}: HarnessSelectProps) {
  const inheritValue = "__inherit__" as const;

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled || isLoading}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={inheritValue}>
          {inheritLabel} ({inheritDisplayName})
        </SelectItem>
        {harnesses.map((h) => (
          <SelectItem key={h.id} value={h.id} disabled={!h.isAvailable}>
            <span className="flex items-center gap-2">
              <span>{h.displayName}</span>
              {!h.isAvailable && (
                <span className="text-muted-foreground text-xs font-normal">
                  — API key not set
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const INHERIT_VALUE = "__inherit__" as const;

export function parseHarnessValue(value: string): HarnessSelectValue {
  return value === INHERIT_VALUE ? null : (value as AgentHarnessId);
}
