/** Native-vector geometry from design/figma/luminous-deco/build.mjs. */
export function Emblem({ variant = 0, className = '' }: { variant?: number; className?: string }) {
  return (
    <svg className={`deco-emblem ${className}`} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="m40 3 37 37-37 37L3 40Z" stroke="currentColor" opacity=".45" />
      <path d="m40 8 32 32-32 32L8 40Z" stroke="currentColor" opacity=".72" />
      <path d="M13 24v-9h10M57 15h10v9M13 56v9h10M57 65h10v-9" stroke="currentColor" opacity=".55" />
      <path
        d={
          [
            'M24 29 40 19l16 10v19L40 60 24 48Z M24 29l16 10 16-10M40 39v21',
            'M20 27 40 57 60 27M25 24l15 22 15-22M31 20h18M34 62h12',
            'm22 58 18-38 18 38M29 44h22M18 62h44M34 54h12',
          ][variant % 3]
        }
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m40 0 2 2-2 2-2-2ZM76 40l2-2 2 2-2 2ZM40 76l2 2-2 2-2-2ZM0 40l2-2 2 2-2 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Flourish() {
  return (
    <svg
      className="deco-flourish"
      viewBox="-96 -25 145 42"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M-94 0H-24C-10 0-9-12 2-12 12-12 8-3 1-3c-5 0-7-5-3-7M-26 0c12 0 15 10 24 10 9 0 13-7 23-7M-13 0C5 0 14-19 36-21 35-8 24-4 12-2M-7 0C6 0 16 14 32 13 26 5 21 1 13 1M12-2l16-14M13 1l12 8m20-30 3 3-3 3-3-3Z" />
    </svg>
  );
}
