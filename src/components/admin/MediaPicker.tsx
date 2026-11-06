import Image from "next/image";
import { db } from "@/lib/db";

/** Photo chooser for a form field (radio grid of the media library, newest first). Server component. */
export async function MediaPicker({ name, value, label, noneLabel }: { name: string; value?: string | null; label: string; noneLabel: string }) {
  const media = await db.media.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, url: true, blurDataUrl: true, isDemo: true } });
  const current = media.find((m) => m.id === value);
  return (
    <details className="rounded-xl p-2 ring-1 ring-ink-100">
      <summary className="flex cursor-pointer items-center gap-3 text-xs font-medium text-ink-700">
        <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-mist">{current && <Image src={current.url} alt="" fill sizes="64px" className="object-cover" />}</span>
        <span>{label}<span className="block font-normal text-sea-700">{current ? "✓" : noneLabel}</span></span>
      </summary>
      <div className="mt-2 grid max-h-72 grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-6">
        <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-lg bg-mist text-center text-[0.65rem] has-[:checked]:ring-2 has-[:checked]:ring-sea-600">
          <input type="radio" name={name} value="" defaultChecked={!current} className="sr-only" />{noneLabel}
        </label>
        {media.map((m) => (
          <label key={m.id} className="relative block aspect-[4/3] cursor-pointer overflow-hidden rounded-lg has-[:checked]:ring-2 has-[:checked]:ring-sea-600">
            <input type="radio" name={name} value={m.id} defaultChecked={m.id === value} className="sr-only" />
            <Image src={m.url} alt="" fill sizes="96px" className="object-cover" placeholder={m.blurDataUrl ? "blur" : "empty"} blurDataURL={m.blurDataUrl ?? undefined} />
            {m.isDemo && <span className="absolute left-0.5 top-0.5 rounded bg-amber-300 px-1 text-[0.5rem] font-bold">DEMO</span>}
          </label>
        ))}
      </div>
    </details>
  );
}
