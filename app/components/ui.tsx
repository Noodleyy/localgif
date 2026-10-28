import { useId, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes } from "react";
import { clamp } from "../lib/time";
import { Icon, type IconName } from "./icons";

export const press = "transition-transform motion-safe:hover:scale-105 motion-safe:active:scale-95";

const TONES = {
  neutral: "border-border-strong bg-surface-alt shadow-sm hover:bg-surface-hover",
  primary: "border-primary-soft/50 bg-primary/15 shadow-sm hover:bg-primary/30",
  floating: "border-border bg-surface/90 shadow-md backdrop-blur-sm hover:bg-surface-alt",
};

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: IconName;
  label: string; // also the tooltip
  tone?: keyof typeof TONES;
  compact?: boolean; // smaller from sm up, where there's a precise pointer
  iconClassName?: string;
};

/** Round button with only an icon. `before:` gives it a bigger, invisible touch area. */
export function IconButton({ icon, label, tone = "neutral", compact, iconClassName = "h-3 w-3", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-ink before:absolute before:-inset-1.5 disabled:pointer-events-none disabled:opacity-40 ${press} ${TONES[tone]} ${compact ? "sm:h-6 sm:w-6 sm:before:-inset-2" : ""}`}
      {...props}
    >
      <Icon name={icon} className={iconClassName} />
    </button>
  );
}

/** A titled section of the page. */
export function Card({ title, className = "", children, ...props }: HTMLAttributes<HTMLElement> & { title: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`flex flex-col rounded-xl border border-border bg-surface p-4 sm:p-6 ${className}`} {...props}>
      <h2 id={id} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Thin bar filled to `value` (0..1). */
export function Bar({ value, fill = "bg-primary", className = "", ...props }: HTMLAttributes<HTMLDivElement> & { value: number; fill?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-ink/10 ${className}`} {...props}>
      <div
        className={`h-full rounded-full transition-[width,background-color] duration-300 ease-out ${fill}`}
        style={{ width: `${clamp(value, 0, 1) * 100}%` }}
      />
    </div>
  );
}

/** 0.42 -> "42%", in a fixed width so the text around it doesn't move. */
export function Percent({ value }: { value: number }) {
  return <span className="inline-block w-[4ch] text-right">{Math.round(value * 100)}%</span>;
}

/** Shimmering block the size of `placeholder`, for a value that's still being read. */
export function Pending({ placeholder }: { placeholder: string }) {
  return (
    <>
      <span className="skeleton-inline" aria-hidden="true">
        {placeholder}
      </span>
      <span className="sr-only">loading</span>
    </>
  );
}

type NumberFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max"> & {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

/**
 * Number box you can clear and retype: values in range apply as you type, anything else
 * is clamped when you leave the field (or press Enter).
 */
export function NumberField({ value, min, max, onChange, className = "", ...props }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value);
        const next = Number(e.target.value);
        if (e.target.value !== "" && next >= min && next <= max) onChange(next);
      }}
      onBlur={() => {
        if (draft !== null && draft !== "" && !Number.isNaN(Number(draft))) onChange(clamp(Math.round(Number(draft)), min, max));
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      // 16px on phones: iOS zooms into any smaller input on focus
      className={`h-10 rounded-lg border border-border-strong bg-surface-alt text-center text-base text-ink sm:h-8 sm:text-sm [appearance:textfield] disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${className}`}
      {...props}
    />
  );
}
