import Link from "next/link";

const FAMOUS = [
  {
    qid: "Q2008469",
    name: "Oakland Cemetery",
    place: "Atlanta, Georgia",
    graves: "80 notable graves",
    residents: "Margaret Mitchell · Bobby Jones · Maynard Jackson",
  },
  {
    qid: "Q360779",
    name: "Sleepy Hollow Cemetery",
    place: "Sleepy Hollow, New York",
    graves: "80 notable graves",
    residents: "Washington Irving · Andrew Carnegie · Elizabeth Arden",
  },
];

/** The two sample tours (saved copies ship with the app), as a quiet way in. */
export function FamousCemeteries({ id = "famous" }: { id?: string }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="space-y-0.5 text-center">
        <p className="label text-mauve">Offline-Ready Tours</p>
        <h2 id={id} className="font-display text-2xl font-normal">
          Or start with a famous one
        </h2>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {FAMOUS.map((s) => (
          <li key={s.qid}>
            <Link href={`/cemetery/${s.qid}`} className="tap card group flex h-full flex-col justify-between gap-2 px-4 py-3.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="label text-[11px] text-candle">{s.graves}</span>
                  <span className="text-xs font-bold text-mauve group-hover:translate-x-0.5 transition-transform">Walk →</span>
                </div>
                <span className="block font-display text-xl">{s.name}</span>
                <span className="block text-sm text-muted">{s.place}</span>
              </div>
              <span className="block border-t border-border pt-2 text-xs text-muted">{s.residents}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
