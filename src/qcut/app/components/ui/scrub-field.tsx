import * as React from "react";

import { cn } from "../../lib/utils";

interface ScrubFieldProps {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min: number;
	max: number;
	step?: number;
	suffix?: string;
	className?: string;
	disabled?: boolean;
}

/**
 * Compact numeric field whose label doubles as a drag handle: drag
 * horizontally to scrub the value, use arrow keys (Shift for x10),
 * or type directly into the input.
 */
export function ScrubField({
	label,
	value,
	onChange,
	min,
	max,
	step = 1,
	suffix = "",
	className,
	disabled = false,
}: ScrubFieldProps) {
	const drag = React.useRef<{ x: number; v: number } | null>(null);
	const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));

	return (
		<label
			className={cn(
				"flex h-9 min-w-0 items-center gap-1 rounded-md border border-input bg-transparent py-1 pr-2 pl-1 shadow-xs focus-within:ring-1 focus-within:ring-ring",
				disabled && "cursor-not-allowed opacity-50",
				className
			)}
		>
			<span
				role="slider"
				aria-label={label}
				aria-valuenow={value}
				aria-valuemin={min}
				aria-valuemax={max}
				aria-disabled={disabled || undefined}
				tabIndex={disabled ? -1 : 0}
				onPointerDown={(e) => {
					if (disabled) return;
					(e.target as HTMLElement).setPointerCapture(e.pointerId);
					drag.current = { x: e.clientX, v: value };
				}}
				onPointerMove={(e) => {
					if (!drag.current) return;
					onChange(
						clamp(drag.current.v + ((e.clientX - drag.current.x) / 2) * step)
					);
				}}
				onPointerUp={() => {
					drag.current = null;
				}}
				onKeyDown={(e) => {
					if (disabled) return;
					const mult = e.shiftKey ? 10 : 1;
					if (e.key === "ArrowUp" || e.key === "ArrowRight") {
						e.preventDefault();
						onChange(clamp(value + step * mult));
					} else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
						e.preventDefault();
						onChange(clamp(value - step * mult));
					}
				}}
				className="flex h-full shrink-0 cursor-ew-resize touch-none select-none items-center rounded-sm px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-hidden"
			>
				{label}
			</span>
			<input
				inputMode="numeric"
				value={value}
				disabled={disabled}
				onChange={(e) => {
					const n = Number(e.target.value.replace(/[^\d-]/g, ""));
					if (!Number.isNaN(n)) onChange(clamp(n));
				}}
				aria-label={`${label} value`}
				className="min-w-0 flex-1 bg-transparent text-sm text-foreground tabular-nums outline-none disabled:cursor-not-allowed"
			/>
			{suffix ? (
				<span className="shrink-0 text-xs text-muted-foreground">{suffix}</span>
			) : null}
		</label>
	);
}
