import Link from "next/link";

const FAMOUS = [
  { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta, Georgia" },
  { qid: "Q360779", name: "Sleepy Hollow Cemetery", place: "Sleepy Hollow, New York" },
];

/** The two sample tours (saved copies ship with the app), as a quiet way in. */
export function FamousCemeteries({ id = "famous" }: { id?: string }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="label text-center text-muted">
        or start with a famous one
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {FAMOUS.map((s) => (
          <li key={s.qid}>
            <Link href={`/cemetery/${s.qid}`} className="tap card block px-4 py-3">
              <span className="font-display text-xl">{s.name}</span>
              <span className="block text-sm text-muted">{s.place}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
