/** A two-leaf sprout in currentColor: the small life sign the games and the calendar share. Decorative. */
export function Sprout({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M12 21v-8.5" />
      <path d="M12 15c-3 0-5-1.8-5.5-4.8 3 0 5 1.8 5.5 4.8Z" />
      <path d="M12 12.5c3 0 5-1.8 5.5-4.8-3 0-5 1.8-5.5 4.8Z" />
    </svg>
  );
}
