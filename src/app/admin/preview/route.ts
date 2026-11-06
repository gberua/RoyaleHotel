import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { currentStaff } from "@/lib/admin-auth";
import { can, type RoleName } from "@/lib/permissions";

/** Staff with content rights turn on Draft Mode and land on the public page, seeing unpublished drafts. */
export async function GET(req: Request) {
  const user = await currentStaff();
  if (!user || !can(user.role as RoleName, "content")) return new Response("Forbidden", { status: 403 });
  const path = new URL(req.url).searchParams.get("path") ?? "/";
  const safe = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/admin") ? path : "/";
  (await draftMode()).enable();
  redirect(safe);
}
