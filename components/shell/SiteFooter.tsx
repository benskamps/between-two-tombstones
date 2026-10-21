import { FenceDivider } from "@/components/ui/Motifs";

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-2xl space-y-4 px-4 pb-24 pt-6 text-sm text-muted">
      {/* Every page ends at the same wrought-iron fence. */}
      <FenceDivider className="opacity-70" />
      <p>
        Data from{" "}
        <a className="underline" href="https://www.wikidata.org">Wikidata</a> (CC0),{" "}
        <a className="underline" href="https://en.wikipedia.org">Wikipedia</a> (CC BY-SA 4.0) and{" "}
        <a className="underline" href="https://www.openstreetmap.org/copyright">
          © OpenStreetMap contributors
        </a>{" "}
        (ODbL). Find a Grave links go to findagrave.com.
      </p>
    </footer>
  );
}
