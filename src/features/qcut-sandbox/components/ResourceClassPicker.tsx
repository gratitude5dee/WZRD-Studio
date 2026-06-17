import type { ResourceClass } from '../api/sandbox-client';

interface Props {
  value: ResourceClass;
  onChange: (v: ResourceClass) => void;
}

export function ResourceClassPicker({ value, onChange }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">Resource class</span>
      <select
        className="rounded border px-3 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value as ResourceClass)}
      >
        <option value="standard">standard (2 vCPU · 4 GB)</option>
        <option value="large">large (4 vCPU · 8 GB)</option>
      </select>
    </label>
  );
}
