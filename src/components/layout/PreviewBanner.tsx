import { draftMode } from "next/headers";

/** Shown to staff previewing unpublished drafts (Draft Mode). Visitors never see it. */
export async function PreviewBanner() {
  if (!(await draftMode()).isEnabled) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex flex-wrap items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950 shadow-lg" role="status">
      <span>PREVIEW — unpublished drafts are shown · წინასწარი ნახვა · Предпросмотр</span>
      <form action="/admin/preview/exit" method="get"><button className="rounded-full bg-amber-950 px-3 py-1 text-amber-50">Exit preview</button></form>
    </div>
  );
}
