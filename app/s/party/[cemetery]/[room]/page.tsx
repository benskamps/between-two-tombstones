import type { Metadata } from "next";
import { readShareRef, SharePage, shareGenerateMetadata } from "@/lib/share/page";

// Rendered per request, like /cemetery/[qid] (the layout's nav reads the path outside <Suspense>).
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/s/party/[cemetery]/[room]">): Promise<Metadata> {
  return shareGenerateMetadata(await readShareRef("party", params));
}

export default async function Page({ params }: PageProps<"/s/party/[cemetery]/[room]">) {
  return <SharePage shareRef={await readShareRef("party", params)} />;
}
