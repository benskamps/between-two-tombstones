// Drawn stand-in for cemeteries with no photo on Wikidata (most of them).
// Three scenes, picked by QID so the same cemetery always gets the same one.
// Colors come from the route palette (app/gravitator/gravitator.css). The
// scenes sit high in the frame because the card's nameplate covers the bottom.

function pick(qid: string): number {
  let h = 0;
  for (const ch of qid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 3;
}

function Sky() {
  return (
    <>
      <rect className="g-art-sky" x="0" y="0" width="400" height="300" />
      {/* Low on the right, clear of the "Full profile" button in the corner. */}
      <circle className="g-art-glow" cx="340" cy="112" r="50" />
      {/* Crescent: a full moon with a sky-colored bite. */}
      <circle className="g-art-moon" cx="340" cy="112" r="24" />
      <circle className="g-art-sky" cx="351" cy="104" r="21" />
    </>
  );
}

function Gate() {
  const bars = Array.from({ length: 11 }, (_, i) => 128 + i * 14.4);
  const top = (x: number) => (x < 200 ? 150 - (x - 126) * 0.5 : 150 - (274 - x) * 0.5);
  return (
    <>
      <path className="g-art-far" d="M0 250 Q100 226 200 236 T400 228 V300 H0Z" />
      {/* Stone pillars with ball finials. */}
      <rect className="g-art-near" x="96" y="120" width="30" height="160" />
      <rect className="g-art-near" x="90" y="112" width="42" height="12" />
      <circle className="g-art-near" cx="111" cy="100" r="12" />
      <rect className="g-art-near" x="274" y="120" width="30" height="160" />
      <rect className="g-art-near" x="268" y="112" width="42" height="12" />
      <circle className="g-art-near" cx="289" cy="100" r="12" />
      {/* Iron gate: an arch, bars with spear tips, two rails. */}
      <path className="g-art-line" d="M126 150 Q200 104 274 150" />
      {bars.map((x) => (
        <g key={x}>
          <line className="g-art-line" x1={x} y1={top(x)} x2={x} y2="280" style={{ strokeWidth: 3 }} />
          <path className="g-art-near" d={`M${x - 4} ${top(x) + 2} L${x} ${top(x) - 9} L${x + 4} ${top(x) + 2}Z`} />
        </g>
      ))}
      <line className="g-art-line" x1="126" y1="196" x2="274" y2="196" style={{ strokeWidth: 4 }} />
      <line className="g-art-line" x1="126" y1="262" x2="274" y2="262" style={{ strokeWidth: 4 }} />
    </>
  );
}

function Headstones() {
  return (
    <>
      <path className="g-art-far" d="M0 246 Q120 216 220 232 T400 224 V300 H0Z" />
      {/* Back row, small and faint. */}
      <path
        className="g-art-far"
        d="M58 240 v-26 a14 14 0 0 1 28 0 v26z M250 230 v-30 a15 15 0 0 1 30 0 v30z M332 226 v-22 a11 11 0 0 1 22 0 v22z"
      />
      {/* An obelisk on a plinth. */}
      <path className="g-art-near" d="M212 280 V150 l12 -28 12 28 V280z" />
      <rect className="g-art-near" x="202" y="262" width="44" height="18" />
      {/* Front row: a round-topped tablet and a gabled one. */}
      <path className="g-art-near" d="M92 284 v-64 a30 30 0 0 1 60 0 v64z" />
      <path className="g-art-near" d="M290 284 v-50 h44 v50z M286 236 h52 l-26 -16z" />
    </>
  );
}

function Willow() {
  // A weeping willow: a mop-shaped canopy whose frayed hem hangs nearly to the ground.
  const drops = [0, 16, 6, 22, 10, 26, 4, 18, 8, 24, 12, 20, 2, 14, 6, 22, 10, 18, 4, 12];
  const hem = drops.map((d, i) => `L${233 - i * 10} ${214 + d} L${230 - i * 10} ${206 + (d >> 1)}`).join(" ");
  return (
    <>
      <path className="g-art-far" d="M0 252 Q140 226 260 238 T400 230 V300 H0Z" />
      <path className="g-art-near" d="M134 284 C138 250 134 232 138 210 L148 210 C150 232 152 250 152 284z" />
      <path className="g-art-near" d={`M142 82 C200 80 236 120 240 206 ${hem} L40 206 C44 120 84 84 142 82Z`} />
      {/* One headstone beyond the tree. */}
      <path className="g-art-near" d="M270 284 v-58 a26 26 0 0 1 52 0 v58z" />
    </>
  );
}

export function PlaceholderArt({ qid, className }: { qid: string; className?: string }) {
  const scene = pick(qid);
  return (
    <svg
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <Sky />
      {/* Lifted 70 units so the scene clears the nameplate; the ground fills in below. */}
      <g transform="translate(0 -70)">{scene === 0 ? <Gate /> : scene === 1 ? <Headstones /> : <Willow />}</g>
      <rect className="g-art-near" x="0" y="208" width="400" height="92" />
      <ellipse className="g-art-mist" cx="130" cy="206" rx="230" ry="18" />
    </svg>
  );
}
