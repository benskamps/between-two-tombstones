import type { Metadata } from "next";
import { readShareRef, SharePage, shareGenerateMetadata } from "@/lib/share/page";

// Rendered per request, like /cemetery/[qid] (the layout's nav reads the path outside <Suspense>).
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/s/stop/[cemetery]/[person]">): Promise<Metadata> {
  return shareGenerateMetadata(await readShareRef("stop", params));
}

export default async function Page({ params }: PageProps<"/s/stop/[cemetery]/[person]">) {
  return <SharePage shareRef={await readShareRef("stop", params)} />;
}
