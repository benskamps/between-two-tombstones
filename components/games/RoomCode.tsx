import "./games.css";
/**
 * A party room code as an instrument readout, one cell per letter (screen
 * readers spell it out, which is what a code needs). The text is the code
 * alone, so `textContent` is exactly the code.
 */
export function RoomCode({ code, small = false, testId }: { code: string; small?: boolean; testId?: string }) {
  return (
    <span className={`room-code ${small ? "room-code-sm" : ""}`} data-testid={testId}>
      {[...code].map((ch, i) => (
        <span key={i} className="room-cell">
          {ch}
        </span>
      ))}
    </span>
  );
}
