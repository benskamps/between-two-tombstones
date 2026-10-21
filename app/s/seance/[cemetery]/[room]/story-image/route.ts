import { shareImageFor } from "@/lib/share/image-route";

/** The 1080×1920 story-size card for this share link. */
export async function GET(_request: Request, { params }: RouteContext<"/s/seance/[cemetery]/[room]/story-image">) {
  return shareImageFor("seance", params, "story");
}
