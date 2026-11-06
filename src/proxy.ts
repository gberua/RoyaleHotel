import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Everything except admin, API, media, Next internals and files with an extension
  matcher: ["/((?!admin|api|media|_next|_vercel|.*\\..*).*)"],
};
