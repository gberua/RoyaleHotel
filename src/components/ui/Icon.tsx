import {
  Accessibility, ArrowRight, Baby, Bath, BedDouble, Bell, Calendar, Car, Castle, Check, CircleParking, Clock,
  Coffee, Flower2, Landmark, Leaf, Lock, Mail, MapPin, Mountain, Plane, Refrigerator, ShieldCheck, ShowerHead,
  Snowflake, Sofa, Sparkles, Sun, Sunrise, Trees, Tv, Umbrella, Users, Utensils, WashingMachine, Waves, Wifi, Wind,
  type LucideIcon, type LucideProps,
} from "lucide-react";

/** Icons that can be chosen for amenities/services/extras from the admin panel (by name). */
export const ICONS: Record<string, LucideIcon> = {
  Accessibility, ArrowRight, Baby, Bath, BedDouble, Bell, Calendar, Car, Castle, Check, CircleParking, Clock,
  Coffee, Flower2, Landmark, Leaf, Lock, Mail, MapPin, Mountain, Plane, Refrigerator, ShieldCheck, ShowerHead,
  Snowflake, Sofa, Sparkles, Sun, Sunrise, Trees, Tv, Umbrella, Users, Utensils, WashingMachine, Waves, Wifi, Wind,
};

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const C = ICONS[name] ?? Sparkles;
  return <C aria-hidden strokeWidth={1.5} {...props} />;
}
