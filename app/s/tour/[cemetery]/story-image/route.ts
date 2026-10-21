import { shareImageFor } from "@/lib/share/image-route";

/** The 1080×1920 story-size card for this share link. */
export async function GET(_request: Request, { params }: RouteContext<"/s/tour/[cemetery]/story-image">) {
  return shareImageFor("tour", params, "story");
}
