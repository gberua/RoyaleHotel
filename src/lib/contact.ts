import type { Settings } from "./settings-schema";

export function contactLinks(c: Settings["contact"], prefill?: string) {
  const tel = c.phone.replace(/[^\d+]/g, "");
  const text = prefill ? `?text=${encodeURIComponent(prefill)}` : "";
  return {
    tel: `tel:${tel}`,
    whatsapp: c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/\D/g, "")}${text}` : null,
    viber: c.viber ? `viber://chat?number=${encodeURIComponent(c.viber.replace(/[^\d+]/g, ""))}` : null,
    telegram: c.telegram ? `https://t.me/${c.telegram.replace(/^@/, "")}` : null,
    email: `mailto:${c.email}`,
  };
}
