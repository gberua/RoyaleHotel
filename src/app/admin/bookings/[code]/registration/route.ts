import { bookingPdf } from "@/lib/admin/booking-pdf";
import { renderRegistrationCard } from "@/lib/notify/documents";

export async function GET(req: Request, { params }: RouteContext<"/admin/bookings/[code]/registration">) {
  return bookingPdf(req, (await params).code, "registration", renderRegistrationCard);
}
