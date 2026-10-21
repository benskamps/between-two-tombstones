import { SHARE_IMAGE_ALT, shareImageFor } from "@/lib/share/page";

export const alt = SHARE_IMAGE_ALT.seance;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: PageProps<"/s/seance/[cemetery]/[room]">["params"] }) {
  return shareImageFor("seance", params, "og");
}
