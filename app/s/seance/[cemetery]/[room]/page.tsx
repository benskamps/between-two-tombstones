import type { Metadata } from "next";
import { readShareRef, SharePage, shareGenerateMetadata } from "@/lib/share/page";

// Rendered per request, like /cemetery/[qid] (the layout's nav reads the path outside <Suspense>).
export const instant = false;

export async function generateMetadata({ params, searchParams }: PageProps<"/s/seance/[cemetery]/[room]">): Promise<Metadata> {
  return shareGenerateMetadata(await readShareRef("seance", params, searchParams));
}

export default async function Page({ params, searchParams }: PageProps<"/s/seance/[cemetery]/[room]">) {
  return <SharePage shareRef={await readShareRef("seance", params, searchParams)} />;
}
