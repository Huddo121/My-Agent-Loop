import type { SandboxType } from "@mono/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export type SandboxTypeSelectValue = SandboxType | null;

export type SandboxTypeSelectProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Label for the null/inherit option (e.g. "System default (Docker)" or "Inherit from workspace"). */
  nullOptionLabel: string;
  placeholder?: string;
};

export const SANDBOX_TYPE_DEFAULT_VALUE = "__default__" as const;

export function parseSandboxTypeValue(value: string): SandboxTypeSelectValue {
  return value === SANDBOX_TYPE_DEFAULT_VALUE ? null : (value as SandboxType);
}

export function SandboxTypeSelect({
  id,
  value,
  onValueChange,
  isLoading = false,
  disabled = false,
  nullOptionLabel,
  placeholder = "Loading…",
}: SandboxTypeSelectProps) {
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
        <SelectItem value={SANDBOX_TYPE_DEFAULT_VALUE}>
          {nullOptionLabel}
        </SelectItem>
        <SelectItem value="docker">Docker</SelectItem>
        <SelectItem value="vm">VM</SelectItem>
      </SelectContent>
    </Select>
  );
}
