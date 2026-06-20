import { type SandboxType, sandboxTypeSchema } from "@mono/api";
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
  // `value`/`onValueChange` are plain strings rather than SandboxTypeSelectValue because this wraps
  // the shadcn Select, whose values are strings — including the SANDBOX_TYPE_DEFAULT_VALUE sentinel,
  // which is not a SandboxType. Callers hold the raw select string and call parseSandboxTypeValue to
  // turn it back into the domain value when they need it.
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
  if (value === SANDBOX_TYPE_DEFAULT_VALUE) {
    return null;
  }
  // Parse rather than assert, so an unexpected string falls back to the default instead of being
  // forced into the SandboxType domain type.
  const parsed = sandboxTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
