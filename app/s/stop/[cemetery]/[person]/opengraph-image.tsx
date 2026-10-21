import { SHARE_IMAGE_ALT, shareImageFor } from "@/lib/share/image-route";

export const alt = SHARE_IMAGE_ALT.stop;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: PageProps<"/s/stop/[cemetery]/[person]">["params"] }) {
  return shareImageFor("stop", params, "og");
}
