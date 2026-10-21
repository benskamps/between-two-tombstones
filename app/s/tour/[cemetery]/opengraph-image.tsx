import { SHARE_IMAGE_ALT, shareImageFor } from "@/lib/share/image-route";

export const alt = SHARE_IMAGE_ALT.tour;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: PageProps<"/s/tour/[cemetery]">["params"] }) {
  return shareImageFor("tour", params, "og");
}
