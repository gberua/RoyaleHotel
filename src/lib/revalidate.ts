import "server-only";
import { updateTag } from "next/cache";
import { TAGS } from "./data";

/** After an admin change, refresh the cached public pages that show this data (immediately, no redeploy). */
export function refreshSite(...keys: (keyof typeof TAGS)[]) {
  for (const k of keys) updateTag(TAGS[k]);
}
