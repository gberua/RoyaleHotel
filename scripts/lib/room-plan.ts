/**
 * The hotel's real room list: 59 rooms — 43 two-person, 6 three-person, 10 four-person.
 * For now only the two-person rooms are offered: the other two types are archived (`active: false`), so they
 * and their rooms are hidden from the site, the booking flow and the calendar but keep their texts and photos.
 * Used by scripts/live-rooms.ts. Prices here are only used when a type is created; after that prices are
 * managed in Admin → Rooms and Rates.
 */
type L = { ka: string; en: string; ru: string };
const t = (ka: string, en: string, ru: string): L => ({ ka, en, ru });

export type PlannedType = {
  slug: string;
  sortOrder: number;
  guests: number;
  /** GEL, used only when the type does not exist yet */
  price: number;
  featured: boolean;
  /** false = archived: the type and its rooms are kept but not offered */
  active: boolean;
  name: L;
  beds: L;
  short: L;
  description: L;
  /** real photos for the room page, matched against the end of Media.sourceFile; empty = leave the links alone */
  photos: string[];
};

export const ROOM_TYPES: PlannedType[] = [
  {
    slug: "standard-double", sortOrder: 1, guests: 2, price: 270, featured: true, active: true,
    name: t("ორადგილიანი ნომერი", "Double Room", "Двухместный номер"),
    beds: t("1 ორადგილიანი საწოლი", "1 double bed", "1 двуспальная кровать"),
    short: t("მყუდრო ნომერი ორი სტუმრისთვის.", "A comfortable room for two guests.", "Уютный номер для двух гостей."),
    description: t(
      "ორადგილიანი ნომერი ორადგილიანი საწოლით, სამუშაო მაგიდით, ტელევიზორით, კარადით და საკუთარი სააბაზანოთი საშხაპით.",
      "A room for two with a double bed, a desk, a TV, a wardrobe and a private bathroom with a shower.",
      "Номер для двоих с двуспальной кроватью, письменным столом, телевизором, шкафом и собственной ванной комнатой с душем.",
    ),
    photos: [],
  },
  {
    slug: "triple", sortOrder: 2, guests: 3, price: 240, featured: true, active: false,
    name: t("სამადგილიანი ნომერი", "Triple Room", "Трёхместный номер"),
    beds: t("3 ერთადგილიანი საწოლი", "3 single beds", "3 односпальные кровати"),
    short: t("ნომერი სამი სტუმრისთვის, სამი ცალკე საწოლით.", "A room for three guests with three single beds.", "Номер для трёх гостей с тремя отдельными кроватями."),
    description: t(
      "სამადგილიანი ნომერი სამი ერთადგილიანი საწოლით, სამუშაო მაგიდით, ტელევიზორით და საკუთარი სააბაზანოთი საშხაპით.",
      "A room for three with three single beds, a desk, a TV and a private bathroom with a shower.",
      "Номер для троих с тремя односпальными кроватями, письменным столом, телевизором и собственной ванной комнатой с душем.",
    ),
    photos: ["0L9A7245.JPG 2.jpg", "0L9A6747.jpg.jpg", "0L9A6757.jpg.jpg", "0L9A7241.JPG.jpg", "0L9A7249.JPG.jpg", "0L9A7215.JPG.jpg"],
  },
  {
    slug: "family-room", sortOrder: 3, guests: 4, price: 320, featured: true, active: false,
    name: t("ოთხადგილიანი საოჯახო ნომერი", "Four-Person Family Room", "Четырёхместный семейный номер"),
    beds: t("საწოლები 4 სტუმრისთვის", "Beds for 4 guests", "Кровати для 4 гостей"),
    short: t("ფართო ნომერი ოთხი სტუმრისთვის — ოჯახისთვის ან მეგობრებისთვის.", "A larger room for four guests — for a family or a group of friends.", "Просторный номер для четырёх гостей — для семьи или компании друзей."),
    description: t(
      "ოთხადგილიანი ნომერი ოჯახისთვის ან მეგობრების ჯგუფისთვის, საკუთარი სააბაზანოთი საშხაპით.",
      "A room for four, suited to a family or a group of friends, with a private bathroom with a shower.",
      "Номер для четверых — для семьи или компании друзей, с собственной ванной комнатой с душем.",
    ),
    // no photos of a four-person room were delivered yet: real shots that are true of every room
    photos: ["0L9A6958.jpg.jpg", "0L9A7215.JPG.jpg", "0L9A6965.jpg.jpg", "0L9A7264.jpg copy.jpg", "0L9A6749.jpg.jpg"],
  },
];

export type PlannedRoom = { number: string; floor: number; slug: string };

/**
 * Room numbers. Floors 8–5: seven two-person rooms, one three-person, two four-person (as the hotel described
 * floors 8, 7 and 6). The split on floors 4 and 3 is provisional until the hotel sends its room-number list;
 * numbers and floors can be corrected in Admin → Rooms.
 */
export function plannedRooms(): PlannedRoom[] {
  const out: PlannedRoom[] = [];
  const add = (floor: number, slugs: string[]) =>
    slugs.forEach((slug, i) => out.push({ number: `${floor}${String(i + 1).padStart(2, "0")}`, floor, slug }));
  const many = (slug: string, n: number) => Array.from({ length: n }, () => slug);
  for (const floor of [8, 7, 6, 5]) add(floor, [...many("standard-double", 7), "triple", ...many("family-room", 2)]);
  add(4, [...many("standard-double", 11), ...many("triple", 2), ...many("family-room", 2)]);
  add(3, many("standard-double", 4));
  return out;
}
