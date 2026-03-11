import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export const HARNESS_DEFAULT_VALUE = "__harness_default__" as const;

export type ModelSelectProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  models: Array<{ id: string; displayName: string }>;
  disabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
};

export function ModelSelect({
  id,
  value,
  onValueChange,
  models,
  disabled = false,
  isLoading = false,
  placeholder = "Loading…",
}: ModelSelectProps) {
  const sortedModels = [...models].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

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
        <SelectItem value={HARNESS_DEFAULT_VALUE}>Harness default</SelectItem>
        {sortedModels.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {model.displayName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function parseModelValue(value: string): string | null {
  return value === HARNESS_DEFAULT_VALUE ? null : value;
}

