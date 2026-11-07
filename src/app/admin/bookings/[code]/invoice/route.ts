import { bookingPdf } from "@/lib/admin/booking-pdf";
import { renderInvoice } from "@/lib/notify/documents";

export async function GET(req: Request, { params }: RouteContext<"/admin/bookings/[code]/invoice">) {
  return bookingPdf(req, (await params).code, "invoice", renderInvoice);
}
