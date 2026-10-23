import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
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
