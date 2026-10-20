import Link from "next/link";
import { NearMeButton } from "@/components/shell/NearMeButton";

const SAMPLES = [
  { qid: "Q2008469", name: "Oakland Cemetery", place: "Atlanta, Georgia" },
  { qid: "Q360779", name: "Sleepy Hollow Cemetery", place: "Sleepy Hollow, New York" },
];

const TOOLS = [
  { href: "/gravitator", title: "Gravitator", body: "Swipe through the public cemeteries near you. Save the ones you like, pass on the rest, or start a tour." },
  { href: "/stamp", title: "Stamp Kit", body: "Turn a photo of a headstone into a rubbing, an ink stamp and a postage stamp." },
  { href: "/spirit", title: "Spirit Box", body: "Static and voices made from the names of people buried here long ago." },
  { href: "/spirit#seance", title: "Séance", body: "Every phone in your group speaks the same spirit words at the same second, from one link." },
  { href: "/games", title: "Graveyard Games", body: "Tombstone Bingo, a party mode for friends, and an EVP recorder." },
  { href: "/calendar", title: "Haunted Calendar", body: "Your calendar gets the death-days of people buried here, every year, each linking to their story." },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="font-display text-4xl leading-tight">Who&rsquo;s buried here, and how did they live?</h1>
        <p className="text-muted">
          Pick a cemetery. We find the graves with the best stories and walk you through them.
        </p>
        <NearMeButton />
        <form action="/search" className="flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">
            Cemetery name
          </label>
          <input
            id="q"
            name="q"
            required
            minLength={2}
            placeholder="Search a cemetery by name"
            className="tap min-w-0 flex-1 rounded-xl border border-border bg-surface px-4"
          />
          <button type="submit" className="tap rounded-xl border border-border px-4 font-bold">
            Search
          </button>
        </form>
      </section>

      <section aria-labelledby="samples" className="space-y-3">
        <h2 id="samples" className="font-display text-2xl">
          Try a tour
        </h2>
        <ul className="grid gap-3">
          {SAMPLES.map((s) => (
            <li key={s.qid}>
              <Link
                href={`/cemetery/${s.qid}`}
                className="tap block rounded-xl border border-border bg-surface p-4"
              >
                <span className="font-display text-xl">{s.name}</span>
                <span className="block text-sm text-muted">{s.place}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tools" className="space-y-3">
        <h2 id="tools" className="font-display text-2xl">
          While you&rsquo;re there
        </h2>
        <ul className="grid gap-3">
          {TOOLS.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="tap block rounded-xl border border-border bg-surface-2 p-4">
                <span className="font-bold">{t.title}</span>
                <span className="block text-muted">{t.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
