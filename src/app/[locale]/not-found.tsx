import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <section className="grid min-h-[70svh] place-items-center bg-mist px-4 pt-[var(--header-h)] text-center">
      <div className="max-w-md">
        <p className="eyebrow mb-3">404</p>
        <h1 className="text-5xl">{t("title")}</h1>
        <p className="mt-4 text-ink-500">{t("text")}</p>
        <Link href="/" className="btn btn-primary mt-8">{t("home")}</Link>
      </div>
    </section>
  );
}
