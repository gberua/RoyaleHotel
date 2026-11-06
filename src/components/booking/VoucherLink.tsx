import { Download } from "lucide-react";

/** Download link for the PDF voucher (an API route serving a file — not a page, so a plain <a download>). */
export function VoucherLink({ label, className = "btn btn-primary" }: { label: string; className?: string }) {
  return (
    <a download href="/api/booking/voucher" className={className}>
      <Download size={16} aria-hidden /> {label}
    </a>
  );
}
