import { siTelegram, siViber, siWhatsapp, siGoogle, siVisa, siMastercard, siInstagram, siFacebook } from "simple-icons";

const icons = {
  whatsapp: siWhatsapp,
  viber: siViber,
  telegram: siTelegram,
  google: siGoogle,
  visa: siVisa,
  mastercard: siMastercard,
  instagram: siInstagram,
  facebook: siFacebook,
};

export function BrandIcon({ name, className, color }: { name: keyof typeof icons; className?: string; color?: string }) {
  const icon = icons[name];
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill={color ?? "currentColor"}>
      <path d={icon.path} />
    </svg>
  );
}
