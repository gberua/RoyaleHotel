"use client";
import { shrinkForUpload } from "@/lib/shrink-image";

/** A file field for plain forms: a photo too large to upload is swapped for a smaller copy as soon as it is picked. */
export function ShrinkingFileInput(props: { name: string; accept?: string; className?: string }) {
  return (
    <input
      type="file"
      {...props}
      onChange={async (e) => {
        const input = e.currentTarget, file = input.files?.[0];
        if (!file) return;
        const small = await shrinkForUpload(file);
        if (small === file || input.files?.[0] !== file) return; // nothing to do, or another file was picked meanwhile
        const dt = new DataTransfer();
        dt.items.add(small);
        input.files = dt.files;
      }}
    />
  );
}
