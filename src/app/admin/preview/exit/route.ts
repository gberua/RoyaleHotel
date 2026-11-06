import { draftMode } from "next/headers";
import { redirect } from "next/navigation";

/** Leaves preview: the public site shows only published content again. */
export async function GET(req: Request) {
  (await draftMode()).disable();
  const back = new URL(req.url).searchParams.get("back");
  redirect(back && back.startsWith("/admin/") ? back : "/admin/content");
}
