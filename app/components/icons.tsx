// Heroicons (MIT). `solid` icons are filled, the rest are outlines of the given stroke width.
const ICONS = {
  stepBack: { solid: true, d: "M9.195 18.44c1.25.714 2.805-.189 2.805-1.629v-2.34l6.945 3.968c1.25.715 2.805-.188 2.805-1.628V8.69c0-1.44-1.555-2.343-2.805-1.628L12 11.03v-2.34c0-1.44-1.555-2.343-2.805-1.628l-7.108 4.061c-1.26.72-1.26 2.536 0 3.256l7.108 4.061Z" },
  stepForward: { solid: true, d: "M5.055 7.06C3.805 6.347 2.25 7.25 2.25 8.69v8.122c0 1.44 1.555 2.343 2.805 1.628L12 14.471v2.34c0 1.44 1.555 2.343 2.805 1.628l7.108-4.061c1.26-.72 1.26-2.536 0-3.256l-7.108-4.061C13.555 6.346 12 7.249 12 8.689v2.34L5.055 7.06Z" },
  chevronLeft: { stroke: 2.5, d: "M15 18l-6-6 6-6" },
  chevronRight: { stroke: 2.5, d: "M9 18l6-6-6-6" },
  minus: { stroke: 2, d: "M5 12h14" },
  plus: { stroke: 2, d: "M12 5v14M5 12h14" },
  close: { stroke: 2, d: "M6 18 18 6M6 6l12 12" },
  upload: { d: "M3 16.5v1.5A2.25 2.25 0 0 0 5.25 20.25h13.5A2.25 2.25 0 0 0 21 18v-1.5M7.5 9.75 12 5.25m0 0 4.5 4.5M12 5.25v10.5" },
  video: { d: "m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" },
  speaker: { d: "M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.5a.75.75 0 0 1-.75-.75v-6a.75.75 0 0 1 .75-.75h2.25Z" },
  speakerOff: { d: "M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.5a.75.75 0 0 1-.75-.75v-6a.75.75 0 0 1 .75-.75h2.25Z" },
  image: { d: "m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" },
  warning: { d: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 4.626c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" },
} satisfies Record<string, { d: string; solid?: boolean; stroke?: number }>;

export type IconName = keyof typeof ICONS;

/** Decorative: whatever it's in carries the label. */
export function Icon({ name, className }: { name: IconName; className: string }) {
  const icon: { d: string; solid?: boolean; stroke?: number } = ICONS[name];
  const paint = icon.solid
    ? { fill: "currentColor" }
    : { fill: "none", stroke: "currentColor", strokeWidth: icon.stroke ?? 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...paint}>
      <path d={icon.d} />
    </svg>
  );
}
