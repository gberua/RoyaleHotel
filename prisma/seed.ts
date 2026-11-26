/**
 * Seed script — `npm run db:seed`
 *
 * Idempotent: it only CREATES missing rows and never overwrites what staff edited in the admin.
 * Starting content (room types, prices, policies…) for the owner to adjust in the admin panel.
 * Real facts used: name, address, phone, check-in/out, Google rating and amenities.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const t = (ka: string, en: string, ru: string) => ({ ka, en, ru });
const GEL = (v: number) => Math.round(v * 100);

// ───────────────────────────── Media ─────────────────────────────
// Rows start without photos: `npm run demo:photos` links licensed demo photos, the admin media library real ones.
type Photo = { id: string | null };
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the arguments describe the slot for readers
const noPhoto = (..._describe: unknown[]): Photo => ({ id: null });

async function setting(key: string, value: Prisma.InputJsonValue) {
  await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });
}

async function main() {
  console.log("Seeding Royal Palace…");

  // ── Owner account ──
  const email = (process.env.SEED_OWNER_EMAIL ?? "owner@royalpalacehotel.ge").toLowerCase();
  const password = process.env.SEED_OWNER_PASSWORD ?? "change-me-now";
  await db.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Owner", role: "OWNER", passwordHash: await bcrypt.hash(password, 12) },
  });

  // ── Currencies (approximate — Settings → Currencies, or switch on the daily NBG update) ──
  for (const [code, symbol, rate, isBase, sortOrder] of [
    ["GEL", "₾", "1", true, 0],
    ["USD", "$", "0.37", false, 1],
    ["EUR", "€", "0.32", false, 2],
  ] as const) {
    await db.currency.upsert({ where: { code }, update: {}, create: { code, symbol, rate, isBase, sortOrder } });
  }

  // ── Photo slots (filled later by demo:photos / the media library) ──
  const m = {
    exterior1: noPhoto("exterior-1", "building", "Hotel exterior", "exterior", 0),
    exterior2: noPhoto("exterior-2", "building", "Hotel at sunset", "exterior", 2),
    lobby: noPhoto("lobby", "lobby", "Lobby & reception", "lobby", 1),
    restaurant1: noPhoto("restaurant-1", "restaurant", "Restaurant", "restaurant", 0),
    restaurant2: noPhoto("restaurant-2", "restaurant", "Breakfast", "restaurant", 2),
    pool1: noPhoto("pool-1", "pool", "Outdoor pool", "pool", 0),
    pool2: noPhoto("pool-2", "pool", "Pool terrace", "pool", 1),
    beach1: noPhoto("beach-1", "sea", "Kobuleti beach", "beach", 0),
    beach2: noPhoto("beach-2", "sea", "Black Sea shore", "beach", 2),
    view1: noPhoto("view-1", "sea", "Sea view", "view", 1),
    hero: noPhoto("hero", "sea", "Hero — hotel & sea", "view", 0),
    garden: noPhoto("garden", "garden", "Hotel garden", "exterior", 1),
  };
  const attractionImg = {
    beach: noPhoto("att-beach", "sea", "Kobuleti beach", "kobuleti", 1),
    batumi: noPhoto("att-batumi", "sea", "Batumi boulevard", "kobuleti", 2),
    botanical: noPhoto("att-botanical", "garden", "Batumi Botanical Garden", "kobuleti", 0),
    petra: noPhoto("att-petra", "fortress", "Petra fortress", "kobuleti", 0),
    reserve: noPhoto("att-reserve", "garden", "Kobuleti reserve", "kobuleti", 2),
    mtirala: noPhoto("att-mtirala", "garden", "Mtirala National Park", "kobuleti", 1),
    gonio: noPhoto("att-gonio", "fortress", "Gonio fortress", "kobuleti", 1),
  };

  // ── Settings ──
  await setting("hotel", {
    name: t("როიალ პალასი", "Royal Palace", "Royal Palace"),
    tagline: t("სიმშვიდე შავი ზღვის პირას", "Calm by the Black Sea", "Спокойствие у Чёрного моря"),
    stars: 4,
    address: t("დავით აღმაშენებლის გამზ. 290ა, ქობულეთი 6200", "290a David Aghmashenebeli Ave, Kobuleti 6200", "пр. Давида Агмашенебели 290а, Кобулети 6200"),
    lat: 41.8361875,
    lng: 41.7778125,
    googleMapsUrl: "https://maps.google.com/?cid=13029375242325335259",
    checkInFrom: "14:00",
    checkOutUntil: "12:00",
    beachDistanceM: 200,
    airportDistanceKm: 30,
    airportDriveMin: 35,
  });
  await setting("contact", {
    phone: "+995 591 05 55 88",
    email: "corporate@royalpalacehotel.ge",
    bookingEmail: "corporate@royalpalacehotel.ge",
    whatsapp: "995591055588",
    viber: "+995591055588",
    telegram: "",
    receptionHours: {},
  });
  await setting("trust", { googleRating: 4.5, googleReviewCount: 46, googleReviewsUrl: "", showBestPriceBadge: true });
  await setting("booking", { freeCancellationDays: 7, depositPercent: 30, allowPayAtHotel: true, allowDeposit: true, allowFullPrepay: true, childFreeUnderAge: 6 });
  await setting("media", { heroImageIds: [m.hero.id, m.pool1.id, m.exterior1.id].filter((x): x is string => !!x), ogImageId: m.hero.id ?? "" });

  // ── Amenities ──
  const amenityDefs: [string, string, ReturnType<typeof t>, "room" | "hotel"][] = [
    ["wifi", "Wifi", t("უფასო Wi-Fi", "Free Wi-Fi", "Бесплатный Wi-Fi"), "hotel"],
    ["parking", "CircleParking", t("უფასო პარკინგი", "Free parking", "Бесплатная парковка"), "hotel"],
    ["pool", "Waves", t("ღია აუზი", "Outdoor pool", "Открытый бассейн"), "hotel"],
    ["restaurant", "Utensils", t("რესტორანი", "Restaurant", "Ресторан"), "hotel"],
    ["beach", "Umbrella", t("პლაჟთან წვდომა", "Beach access", "Доступ к пляжу"), "hotel"],
    ["shuttle", "Plane", t("აეროპორტის ტრანსფერი", "Airport shuttle", "Трансфер из аэропорта"), "hotel"],
    ["breakfast", "Coffee", t("საუზმე (ფასიანი)", "Breakfast (paid)", "Завтрак (платно)"), "hotel"],
    ["ac", "Snowflake", t("კონდიციონერი", "Air conditioning", "Кондиционер"), "hotel"],
    ["laundry", "WashingMachine", t("სამრეცხაო", "Laundry service", "Прачечная"), "hotel"],
    // in-room
    ["room-ac", "Snowflake", t("კონდიციონერი", "Air conditioning", "Кондиционер"), "room"],
    ["room-wifi", "Wifi", t("Wi-Fi", "Wi-Fi", "Wi-Fi"), "room"],
    ["tv", "Tv", t("ტელევიზორი", "Flat-screen TV", "Телевизор"), "room"],
    ["shower", "ShowerHead", t("აბაზანა შხაპით", "Private bathroom with shower", "Ванная с душем"), "room"],
    ["bathtub", "Bath", t("აბაზანა ვანით", "Bathtub", "Ванна"), "room"],
    ["fridge", "Refrigerator", t("მაცივარი", "Mini fridge", "Мини-холодильник"), "room"],
    ["hairdryer", "Wind", t("თმის საშრობი", "Hairdryer", "Фен"), "room"],
    ["balcony", "Sun", t("აივანი", "Balcony", "Балкон"), "room"],
    ["sea-view", "Sunrise", t("ზღვის ხედი", "Sea view", "Вид на море"), "room"],
    ["sofa", "Sofa", t("სასტუმრო ოთახი დივნით", "Living area with sofa", "Гостиная зона с диваном"), "room"],
    ["kettle", "Coffee", t("ჩაიდანი", "Kettle, tea & coffee", "Чайник, чай и кофе"), "room"],
    ["safe", "Lock", t("სეიფი", "In-room safe", "Сейф"), "room"],
    ["cot", "Baby", t("ბავშვის საწოლი მოთხოვნით", "Baby cot on request", "Детская кроватка по запросу"), "room"],
  ];
  const amenity: Record<string, string> = {};
  for (const [i, [key, icon, name, scope]] of amenityDefs.entries()) {
    const a = await db.amenity.upsert({ where: { key }, update: {}, create: { key, icon, name, scope, sortOrder: i } });
    amenity[key] = a.id;
  }

  // ── Room types ──
  const base = ["room-ac", "room-wifi", "tv", "shower", "hairdryer", "fridge", "kettle"];
  const roomTypes = [
    {
      slug: "standard-double", sortOrder: 1, price: 180, weekend: 200, size: 20, view: "garden", adults: 2, children: 1, occ: 3, rooms: ["101", "102", "103", "104", "105", "106", "107", "108"],
      name: t("სტანდარტული ორადგილიანი", "Standard Double", "Стандартный двухместный"),
      beds: t("1 ორადგილიანი საწოლი", "1 double bed", "1 двуспальная кровать"),
      short: t("მყუდრო ნომერი ორისთვის — იდეალური მოკლე ზღვისპირა დასვენებისთვის.", "A cosy room for two — ideal for a short seaside break.", "Уютный номер для двоих — идеален для короткого отдыха у моря."),
      amenities: [...base, "cot"], scenes: [0, 1], featured: true,
    },
    {
      slug: "twin", sortOrder: 2, price: 180, weekend: 200, size: 20, view: "garden", adults: 2, children: 0, occ: 2, rooms: ["109", "110", "111", "112", "113", "114"],
      name: t("სტანდარტული Twin", "Standard Twin", "Стандартный Twin"),
      beds: t("2 ერთადგილიანი საწოლი", "2 single beds", "2 односпальные кровати"),
      short: t("ორი ცალკე საწოლი — მეგობრებისთვის ან ოჯახის წევრებისთვის.", "Two separate beds — perfect for friends or family members travelling together.", "Две отдельные кровати — для друзей или родственников."),
      amenities: base, scenes: [2, 0], featured: false,
    },
    {
      slug: "deluxe-sea-view", sortOrder: 3, price: 260, weekend: 290, size: 26, view: "sea", adults: 2, children: 1, occ: 3, rooms: ["201", "202", "203", "204", "205", "206", "207", "208", "209", "210"],
      name: t("დელუქსი ზღვის ხედით", "Deluxe Sea View", "Делюкс с видом на море"),
      beds: t("1 დიდი ორადგილიანი საწოლი", "1 king-size bed", "1 кровать king-size"),
      short: t("აივანი ზღვის ხედით, დიდი საწოლი და მზის ჩასვლა ყოველ საღამოს.", "A balcony facing the sea, a king-size bed and the sunset every evening.", "Балкон с видом на море, большая кровать и закат каждый вечер."),
      amenities: [...base, "balcony", "sea-view", "safe", "cot"], scenes: [1, 2], featured: true,
    },
    {
      slug: "family-room", sortOrder: 4, price: 320, weekend: 350, size: 34, view: "partial_sea", adults: 3, children: 2, occ: 4, rooms: ["301", "302", "303", "304"],
      name: t("საოჯახო ნომერი", "Family Room", "Семейный номер"),
      beds: t("1 ორადგილიანი + 2 ერთადგილიანი საწოლი", "1 double bed + 2 single beds", "1 двуспальная + 2 односпальные кровати"),
      short: t("ფართო ნომერი მთელი ოჯახისთვის — ადგილი ყველასთვის.", "A spacious room for the whole family, with space for everyone.", "Просторный номер для всей семьи — места хватит всем."),
      amenities: [...base, "balcony", "safe", "cot"], scenes: [0, 2], featured: true,
    },
    {
      slug: "royal-suite", sortOrder: 5, price: 450, weekend: 490, size: 45, view: "sea", adults: 2, children: 2, occ: 4, rooms: ["401", "402"],
      name: t("როიალ სუიტა", "Royal Suite", "Люкс Royal"),
      beds: t("1 დიდი ორადგილიანი საწოლი + დივანი-საწოლი", "1 king-size bed + sofa bed", "1 кровать king-size + диван-кровать"),
      short: t("ცალკე მისაღები, ზღვის ხედი და ყველაზე მშვიდი საღამოები სასტუმროში.", "A separate living room, sea views and the quietest evenings in the hotel.", "Отдельная гостиная, вид на море и самые тихие вечера в отеле."),
      amenities: [...base, "bathtub", "balcony", "sea-view", "sofa", "safe", "cot"], scenes: [2, 1], featured: true,
    },
  ];

  const longDescription = (name: ReturnType<typeof t>) =>
    t(
      `${name.ka} — ნათელი ნომერი მშვიდ, ზღვით შთაგონებულ ფერებში. დილით — ყავა აივანზე ან საუზმე რესტორანში, დღისით — აუზი და პლაჟი, საღამოს — მშვიდი ძილი კონდიციონერით გაგრილებულ ოთახში.`,
      `The ${name.en} is a bright room in calm, sea-inspired colours. Start the day with coffee on the balcony or breakfast in the restaurant, spend it at the pool or on the beach, and end it with a quiet, air-conditioned night's sleep.`,
      `${name.ru} — светлый номер в спокойных морских тонах. Утро начинается с кофе на балконе или завтрака в ресторане, день — у бассейна или на пляже, а вечер — со спокойного сна в прохладе кондиционера.`,
    );

  const roomTypeIds: Record<string, string> = {};
  for (const [idx, r] of roomTypes.entries()) {
    const photos = [
      noPhoto(`room-${r.slug}-1`, "room", r.name.en, "room", r.scenes[0]),
      noPhoto(`room-${r.slug}-2`, "room", `${r.name.en} — detail`, "room", r.scenes[1]),
      noPhoto(`room-${r.slug}-3`, r.view === "sea" ? "sea" : "garden", `${r.name.en} — view`, "room", idx % 3),
    ];
    const existing = await db.roomType.findUnique({ where: { slug: r.slug } });
    const rt =
      existing ??
      (await db.roomType.create({
        data: {
          slug: r.slug,
          name: r.name,
          shortDescription: r.short,
          description: longDescription(r.name),
          sizeM2: r.size,
          beds: r.beds,
          view: r.view,
          maxAdults: r.adults,
          maxChildren: r.children,
          maxOccupancy: r.occ,
          extraBeds: r.occ > r.adults ? 1 : 0,
          baseOccupancy: r.slug === "family-room" ? 4 : 2,
          basePrice: GEL(r.price),
          weekendPrice: GEL(r.weekend),
          minStay: 1,
          sortOrder: r.sortOrder,
          featured: r.featured,
          photos: { create: photos.flatMap((p, i) => (p.id ? [{ mediaId: p.id, sortOrder: i }] : [])) },
          amenities: { create: r.amenities.map((k) => ({ amenityId: amenity[k] })) },
        },
      }));
    roomTypeIds[r.slug] = rt.id;
    for (const number of r.rooms) {
      await db.room.upsert({
        where: { number },
        update: {},
        create: { number, floor: Number(number[0]), roomTypeId: rt.id },
      });
    }
  }

  // ── Seasons — base price = low season ──
  const seasons = [
    { id: "season-2027-june", name: t("ივნისი 2027", "June 2027", "Июнь 2027"), start: "2027-06-01", end: "2027-06-30", factor: 1.25, minStay: null, color: "#6fcdc8" },
    { id: "season-2027-high", name: t("მაღალი სეზონი 2027", "High season 2027", "Высокий сезон 2027"), start: "2027-07-01", end: "2027-08-31", factor: 1.6, minStay: 3, color: "#0b7c79" },
    { id: "season-2027-sept", name: t("სექტემბერი 2027", "September 2027", "Сентябрь 2027"), start: "2027-09-01", end: "2027-09-30", factor: 1.2, minStay: null, color: "#a7e1dd" },
  ];
  for (const s of seasons) {
    await db.season.upsert({
      where: { id: s.id },
      update: {},
      create: { id: s.id, name: s.name, startDate: new Date(s.start), endDate: new Date(s.end), color: s.color },
    });
    for (const r of roomTypes) {
      await db.seasonRate.upsert({
        where: { seasonId_roomTypeId: { seasonId: s.id, roomTypeId: roomTypeIds[r.slug] } },
        update: {},
        create: {
          seasonId: s.id,
          roomTypeId: roomTypeIds[r.slug],
          price: GEL(Math.round((r.price * s.factor) / 5) * 5),
          weekendPrice: GEL(Math.round((r.weekend * s.factor) / 5) * 5),
          minStay: s.minStay,
        },
      });
    }
  }

  // ── Child / extra-bed pricing ──
  if ((await db.occupancyRule.count()) === 0) {
    await db.occupancyRule.createMany({
      data: [
        { kind: "child", minAge: 0, maxAge: 5, pricePerNight: 0, name: t("ბავშვი 0–5 წლის", "Child 0–5 years", "Ребёнок 0–5 лет") },
        { kind: "child", minAge: 6, maxAge: 12, pricePerNight: GEL(40), name: t("ბავშვი 6–12 წლის", "Child 6–12 years", "Ребёнок 6–12 лет") },
        { kind: "extra_adult", minAge: 13, pricePerNight: GEL(60), name: t("დამატებითი საწოლი ზრდასრულისთვის", "Extra bed for an adult", "Доп. кровать для взрослого") },
      ],
    });
  }

  // ── Extras ──
  const extras = [
    { key: "breakfast", icon: "Coffee", price: 30, unit: "PER_GUEST_NIGHT" as const, name: t("საუზმე", "Breakfast", "Завтрак"), description: t("შვედური მაგიდა რესტორანში ყოველ დილით.", "Breakfast in the restaurant every morning.", "Завтрак в ресторане каждое утро.") },
    { key: "airport-transfer", icon: "Plane", price: 80, unit: "PER_STAY" as const, name: t("ტრანსფერი ბათუმის აეროპორტიდან", "Batumi airport transfer", "Трансфер из аэропорта Батуми"), description: t("პირადი ტრანსფერი ერთი მიმართულებით.", "Private one-way transfer.", "Индивидуальный трансфер в одну сторону.") },
    { key: "late-checkout", icon: "Clock", price: 50, unit: "PER_STAY" as const, name: t("გვიანი გასვლა (16:00-მდე)", "Late check-out (until 16:00)", "Поздний выезд (до 16:00)"), description: t("ხელმისაწვდომობის შემთხვევაში.", "Subject to availability.", "При наличии возможности.") },
    { key: "early-checkin", icon: "Sunrise", price: 50, unit: "PER_STAY" as const, name: t("ადრეული შესვლა (10:00-დან)", "Early check-in (from 10:00)", "Ранний заезд (с 10:00)"), description: t("ხელმისაწვდომობის შემთხვევაში.", "Subject to availability.", "При наличии возможности.") },
    { key: "baby-cot", icon: "Baby", price: 0, unit: "PER_STAY" as const, name: t("ბავშვის საწოლი", "Baby cot", "Детская кроватка"), description: t("უფასოდ, მოთხოვნით.", "Free of charge, on request.", "Бесплатно, по запросу.") },
  ];
  for (const [i, e] of extras.entries()) {
    await db.extra.upsert({
      where: { key: e.key },
      update: {},
      create: { key: e.key, icon: e.icon, price: GEL(e.price), unit: e.unit, name: e.name, description: e.description, sortOrder: i },
    });
  }

  // ── Promo code (sample) ──
  await db.promoCode.upsert({
    where: { code: "EARLY10" },
    update: {},
    create: { code: "EARLY10", description: "Early summer booking", type: "PERCENT", value: 10, minNights: 3, stayFrom: new Date("2027-06-01"), stayTo: new Date("2027-09-30") },
  });

  // ── Services ──
  const services = [
    { key: "pool", icon: "Waves", mediaId: m.pool1.id, title: t("ღია აუზი", "Outdoor pool", "Открытый бассейн"), description: t("მზის ლოგინებით და მშვიდი ტერასით — იდეალური ადგილი ზღვის შემდეგ.", "With sun loungers and a calm terrace — the perfect place after the sea.", "С шезлонгами и тихой террасой — идеальное место после моря.") },
    { key: "restaurant", icon: "Utensils", mediaId: m.restaurant1.id, title: t("რესტორანი", "Restaurant", "Ресторан"), description: t("აჭარული და ევროპული სამზარეულო, საუზმე ყოველ დილით (ფასიანი).", "Adjarian and European dishes, with breakfast every morning (paid).", "Аджарская и европейская кухня, завтрак каждое утро (платно).") },
    { key: "beach", icon: "Umbrella", mediaId: m.beach1.id, title: t("პლაჟი", "Beach", "Пляж"), description: t("ქობულეთის გრძელი კენჭოვანი პლაჟი და სუფთა შავი ზღვა.", "Kobuleti's long pebble beach and the clear Black Sea.", "Длинный галечный пляж Кобулети и чистое Чёрное море.") },
    { key: "transfer", icon: "Plane", mediaId: null, title: t("აეროპორტის ტრანსფერი", "Airport transfer", "Трансфер из аэропорта"), description: t("დაგხვდებით ბათუმის აეროპორტში და პირდაპირ სასტუმრომდე მოგიყვანთ.", "We'll meet you at Batumi airport and drive you straight to the hotel.", "Встретим в аэропорту Батуми и довезём прямо до отеля.") },
    { key: "parking", icon: "CircleParking", mediaId: null, title: t("უფასო პარკინგი", "Free parking", "Бесплатная парковка"), description: t("უფასო ავტოსადგომი სასტუმროს სტუმრებისთვის.", "Free on-site parking for hotel guests.", "Бесплатная парковка для гостей отеля.") },
    { key: "wifi", icon: "Wifi", mediaId: null, title: t("უფასო Wi-Fi", "Free Wi-Fi", "Бесплатный Wi-Fi"), description: t("უფასო ინტერნეტი მთელ სასტუმროში.", "Free internet throughout the hotel.", "Бесплатный интернет по всему отелю.") },
    { key: "laundry", icon: "WashingMachine", mediaId: null, title: t("სამრეცხაო", "Laundry", "Прачечная"), description: t("რეცხვისა და დაუთოების სერვისი.", "Washing and ironing service.", "Услуги стирки и глажки.") },
    { key: "ac", icon: "Snowflake", mediaId: null, title: t("კონდიციონერი", "Air conditioning", "Кондиционер"), description: t("გრილი ნომრები ცხელ ზაფხულშიც.", "Cool rooms even on the hottest summer days.", "Прохладные номера даже в самый жаркий день.") },
  ];
  for (const [i, s] of services.entries()) {
    await db.service.upsert({ where: { key: s.key }, update: {}, create: { ...s, sortOrder: i } });
  }

  // ── Offers ──
  await db.offer.upsert({
    where: { slug: "early-summer" },
    update: {},
    create: {
      slug: "early-summer",
      title: t("ადრეული ზაფხული −10%", "Early summer −10%", "Раннее лето −10%"),
      summary: t("დაჯავშნეთ ზაფხული წინასწარ და დაზოგეთ 10% 3+ ღამეზე.", "Book your summer early and save 10% on stays of 3+ nights.", "Бронируйте лето заранее и экономьте 10% при проживании от 3 ночей."),
      body: t("გამოიყენეთ კოდი EARLY10 დაჯავშნისას. მოქმედებს 2027 წლის ივნისი–სექტემბრის ვიზიტებზე.", "Use code EARLY10 when booking. Valid for stays from June to September 2027.", "Используйте код EARLY10 при бронировании. Действует на проживание с июня по сентябрь 2027."),
      badge: t("−10%", "−10%", "−10%"),
      promoCode: "EARLY10",
      mediaId: m.pool2.id,
      validTo: new Date("2027-05-31"),
      sortOrder: 1,
    },
  });
  await db.offer.upsert({
    where: { slug: "family-summer" },
    update: {},
    create: {
      slug: "family-summer",
      title: t("საოჯახო ზაფხული", "Family summer", "Семейное лето"),
      summary: t("ბავშვები 6 წლამდე — უფასოდ, ბავშვის საწოლი — საჩუქრად.", "Children under 6 stay free, and a baby cot is on us.", "Дети до 6 лет — бесплатно, детская кроватка — в подарок."),
      body: t("საოჯახო ნომერი, საუზმე და ადრეული შესვლა ერთ პაკეტში.", "Family Room, breakfast and early check-in in one package.", "Семейный номер, завтрак и ранний заезд в одном пакете."),
      badge: t("ოჯახებისთვის", "For families", "Для семей"),
      mediaId: m.beach2.id,
      sortOrder: 2,
    },
  });

  // ── Attractions (approximate distances — verify) ──
  const attractions = [
    { slug: "kobuleti-beach", km: 0.2, min: 3, img: attractionImg.beach, title: t("ქობულეთის პლაჟი", "Kobuleti beach", "Пляж Кобулети"), summary: t("10 კმ-ზე მეტი სიგრძის კენჭოვანი პლაჟი, ფიჭვნარით გაყოლებული ბულვარით.", "A pebble beach over 10 km long, lined by a pine-shaded boulevard.", "Галечный пляж длиной более 10 км с сосновым бульваром вдоль берега.") },
    { slug: "petra-fortress", km: 7, min: 12, img: attractionImg.petra, title: t("პეტრას ციხე", "Petra fortress", "Крепость Петра"), summary: t("ბიზანტიური ციხის ნანგრევები ციხისძირში, ზღვის თავზე — ულამაზესი ხედით.", "Ruins of a Byzantine fortress at Tsikhisdziri, high above the sea with a superb view.", "Руины византийской крепости в Цихисдзири над морем — с потрясающим видом.") },
    { slug: "batumi-botanical-garden", km: 15, min: 25, img: attractionImg.botanical, title: t("ბათუმის ბოტანიკური ბაღი", "Batumi Botanical Garden", "Батумский ботанический сад"), summary: t("მწვანე კონცხზე გაშენებული ერთ-ერთი უდიდესი ბოტანიკური ბაღი, ზღვის ხედებით.", "One of the largest botanical gardens in the region, on the Green Cape above the sea.", "Один из крупнейших ботанических садов региона на Зелёном мысу над морем.") },
    { slug: "batumi", km: 27, min: 35, img: attractionImg.batumi, title: t("ბათუმი", "Batumi", "Батуми"), summary: t("ბულვარი, ძველი ქალაქი, ალი და ნინო, რესტორნები და ღამის ცხოვრება.", "The boulevard, the old town, the Ali & Nino statue, restaurants and nightlife.", "Бульвар, старый город, Али и Нино, рестораны и ночная жизнь.") },
    { slug: "kobuleti-reserve", km: 3, min: 7, img: attractionImg.reserve, title: t("ქობულეთის დაცული ტერიტორიები", "Kobuleti Protected Areas", "Кобулетские охраняемые территории"), summary: t("უნიკალური ისპანის ტორფიანი ჭაობები და ფრინველებზე დაკვირვება.", "The unique Ispani peat bogs and bird-watching trails.", "Уникальные торфяные болота Испани и маршруты для наблюдения за птицами.") },
    { slug: "mtirala-national-park", km: 30, min: 45, img: attractionImg.mtirala, title: t("მტირალას ეროვნული პარკი", "Mtirala National Park", "Национальный парк Мтирала"), summary: t("ტყის ბილიკები, ჩანჩქერები და ტბა — ერთ-ერთი ყველაზე წვიმიანი ადგილი საქართველოში.", "Forest trails, waterfalls and a lake in one of the wettest places in Georgia.", "Лесные тропы, водопады и озеро в одном из самых дождливых мест Грузии.") },
    { slug: "gonio-fortress", km: 40, min: 50, img: attractionImg.gonio, title: t("გონიოს ციხე", "Gonio fortress", "Крепость Гонио"), summary: t("რომაული ციხესიმაგრე ბათუმის სამხრეთით, ორი ათასი წლის ისტორიით.", "A Roman fortress south of Batumi with two thousand years of history.", "Римская крепость к югу от Батуми с двухтысячелетней историей.") },
  ];
  for (const [i, a] of attractions.entries()) {
    await db.attraction.upsert({
      where: { slug: a.slug },
      update: {},
      create: { slug: a.slug, title: a.title, summary: a.summary, distanceKm: a.km, driveMinutes: a.min, mediaId: a.img.id, sortOrder: i },
    });
  }

  // ── FAQ ──
  if ((await db.faqItem.count()) === 0) {
    const faq = [
      ["stay", t("როდის არის შესვლა და გასვლა?", "What time are check-in and check-out?", "Во сколько заезд и выезд?"), t("შესვლა — 14:00-დან, გასვლა — 12:00-მდე. ადრეული შესვლა და გვიანი გასვლა შესაძლებელია ხელმისაწვდომობის შემთხვევაში.", "Check-in is from 14:00 and check-out is until 12:00. Early check-in and late check-out are possible subject to availability.", "Заезд — с 14:00, выезд — до 12:00. Ранний заезд и поздний выезд возможны при наличии мест.")],
      ["stay", t("საუზმე ფასში შედის?", "Is breakfast included?", "Завтрак включён?"), t("საუზმე ფასიანია და შეგიძლიათ დაამატოთ დაჯავშნისას ან ადგილზე.", "Breakfast is available for an extra charge — add it while booking or at the hotel.", "Завтрак оплачивается отдельно — добавьте его при бронировании или в отеле.")],
      ["stay", t("არის პარკინგი?", "Is there parking?", "Есть ли парковка?"), t("დიახ, სასტუმროში უფასო პარკინგია.", "Yes, parking at the hotel is free.", "Да, парковка при отеле бесплатная.")],
      ["stay", t("რამდენად შორს არის პლაჟი?", "How far is the beach?", "Далеко ли пляж?"), t("პლაჟამდე რამდენიმე წუთის სავალია.", "The beach is a few minutes' walk away.", "До пляжа несколько минут пешком.")],
      ["stay", t("აუზი მთელი წლის განმავლობაში მუშაობს?", "Is the pool open all year?", "Бассейн работает круглый год?"), t("ღია აუზი მუშაობს თბილ სეზონზე.", "The outdoor pool is open in the warm season.", "Открытый бассейн работает в тёплый сезон.")],
      ["travel", t("როგორ მოვხვდე ბათუმის აეროპორტიდან?", "How do I get here from Batumi airport?", "Как добраться из аэропорта Батуми?"), t("აეროპორტი დაახლოებით 30 კმ-შია (≈35 წთ). შეგიძლიათ დაჯავშნოთ ჩვენი ტრანსფერი ან აიყვანოთ ტაქსი.", "The airport is about 30 km away (≈35 min). Book our transfer or take a taxi.", "Аэропорт примерно в 30 км (≈35 мин). Закажите наш трансфер или возьмите такси.")],
      ["family", t("შეიძლება ბავშვებთან ერთად?", "Are children welcome?", "Можно с детьми?"), t("რა თქმა უნდა! ბავშვის საწოლი უფასოა მოთხოვნით. ბავშვების ფასები ჩანს დაჯავშნისას.", "Of course! A baby cot is free on request. Prices for children are shown when booking.", "Конечно! Детская кроватка — бесплатно по запросу. Цены для детей видны при бронировании.")],
      ["family", t("შეიძლება შინაური ცხოველით?", "Can I bring my pet?", "Можно с домашним животным?"), t("შინაური ცხოველები — წინასწარი შეთანხმებით. დაგვიკავშირდით დაჯავშნამდე.", "Pets are accepted on request. Please contact us before booking.", "Домашние животные — по предварительному согласованию. Свяжитесь с нами до бронирования.")],
      ["booking", t("როგორ გადავიხადო?", "How can I pay?", "Как оплатить?"), t("ონლაინ ბარათით (დაცული გადახდა), დეპოზიტით ან ადგილზე — თქვენი არჩევანით.", "Online by card (secure payment), with a deposit, or at the hotel — your choice.", "Онлайн картой (безопасная оплата), депозитом или в отеле — на ваш выбор.")],
      ["booking", t("როგორ გავაუქმო ჯავშანი?", "How do I cancel a booking?", "Как отменить бронирование?"), t("გვერდზე „ჯავშნის მართვა“ ჯავშნის კოდითა და ელ-ფოსტით. უფასო გაუქმება — ჩამოსვლამდე 7 დღით ადრე.", "On the “Manage booking” page with your booking code and email. Free cancellation up to 7 days before arrival.", "На странице «Моё бронирование» по коду и e-mail. Бесплатная отмена — за 7 дней до заезда.")],
      ["booking", t("რატომ ჯობია პირდაპირ დაჯავშნა?", "Why book directly with you?", "Почему выгодно бронировать напрямую?"), t("პირდაპირ ჯავშანზე საუკეთესო ფასს გარანტიას გაძლევთ, საკომისიოს გარეშე, და პირდაპირ გვიკავშირდებით ნებისმიერ საკითხზე.", "We guarantee our best price for direct bookings, with no commission, and you deal with us directly for anything you need.", "При прямом бронировании мы гарантируем лучшую цену без комиссии, а все вопросы решаете напрямую с нами.")],
    ] as const;
    await db.faqItem.createMany({ data: faq.map(([category, question, answer], i) => ({ category, question, answer, sortOrder: i })) });
  }

  // ── Policies (review with a lawyer before going live) ──
  const policies = [
    {
      slug: "check-in", title: t("შესვლა და გასვლა", "Check-in & check-out", "Заезд и выезд"),
      body: t(
        "## შესვლა\nშესვლა — **14:00-დან**. გთხოვთ, წარმოადგინოთ პირადობის მოწმობა ან პასპორტი.\n\n## გასვლა\nგასვლა — **12:00-მდე**. გვიანი გასვლა შესაძლებელია ხელმისაწვდომობის შემთხვევაში, დამატებითი საფასურით.",
        "## Check-in\nCheck-in is from **14:00**. Please present a valid ID card or passport.\n\n## Check-out\nCheck-out is until **12:00**. Late check-out is possible subject to availability, for an extra charge.",
        "## Заезд\nЗаезд — с **14:00**. Пожалуйста, предъявите удостоверение личности или паспорт.\n\n## Выезд\nВыезд — до **12:00**. Поздний выезд возможен при наличии мест за дополнительную плату.",
      ),
    },
    {
      slug: "cancellation", title: t("გაუქმების პოლიტიკა", "Cancellation policy", "Правила отмены"),
      body: t(
        "## უფასო გაუქმება\nჯავშნის გაუქმება უფასოა ჩამოსვლამდე **7 დღით ადრე**.\n\n## გვიანი გაუქმება\nჩამოსვლამდე 7 დღეზე ნაკლები დროით ადრე გაუქმებისას ან გამოუცხადებლობისას ჩამოიჭრება პირველი ღამის ღირებულება.\n\n## როგორ გავაუქმო\nგვერდზე „ჯავშნის მართვა“ ან დაგვიკავშირდით.",
        "## Free cancellation\nCancellation is free up to **7 days before arrival**.\n\n## Late cancellation\nFor cancellations within 7 days of arrival or no-shows, the first night is charged.\n\n## How to cancel\nUse the “Manage booking” page or contact us.",
        "## Бесплатная отмена\nОтмена бесплатна не позднее чем за **7 дней до заезда**.\n\n## Поздняя отмена\nПри отмене менее чем за 7 дней или неявке взимается стоимость первой ночи.\n\n## Как отменить\nНа странице «Моё бронирование» или свяжитесь с нами.",
      ),
    },
    {
      slug: "children", title: t("ბავშვები და დამატებითი საწოლი", "Children & extra beds", "Дети и дополнительные кровати"),
      body: t(
        "ბავშვები ნებისმიერი ასაკისა სასურველი სტუმრები არიან.\n\n- 0–5 წლის ბავშვები — უფასოდ არსებულ საწოლებში\n- 6–12 წლის ბავშვები — ღამეში 40 ₾\n- დამატებითი საწოლი ზრდასრულისთვის — ღამეში 60 ₾\n- ბავშვის საწოლი — უფასოდ, მოთხოვნით",
        "Children of all ages are welcome.\n\n- Children 0–5 years stay free using existing beds\n- Children 6–12 years: 40 ₾ per night\n- Extra bed for an adult: 60 ₾ per night\n- Baby cot: free of charge, on request",
        "Дети любого возраста — желанные гости.\n\n- Дети 0–5 лет — бесплатно на существующих кроватях\n- Дети 6–12 лет — 40 ₾ за ночь\n- Доп. кровать для взрослого — 60 ₾ за ночь\n- Детская кроватка — бесплатно, по запросу",
      ),
    },
    {
      slug: "pets", title: t("შინაური ცხოველები", "Pets", "Домашние животные"),
      body: t("შინაური ცხოველები დაიშვება **წინასწარი შეთანხმებით**. გთხოვთ, დაგვიკავშირდეთ დაჯავშნამდე. შეიძლება მოქმედებდეს დამატებითი საფასური.", "Pets are allowed **on request**. Please contact us before booking. Additional charges may apply.", "Домашние животные допускаются **по запросу**. Пожалуйста, свяжитесь с нами до бронирования. Может взиматься доплата."),
    },
    {
      slug: "privacy", title: t("კონფიდენციალურობის პოლიტიკა", "Privacy policy", "Политика конфиденциальности"),
      body: t(
        "## რა მონაცემებს ვაგროვებთ\nსახელს, ელ-ფოსტას, ტელეფონს და ვიზიტის დეტალებს — მხოლოდ ჯავშნისა და თქვენთან კომუნიკაციისთვის.\n\n## Cookie ფაილები\nაუცილებელი cookie-ები საიტის მუშაობისთვის; ანალიტიკური და მარკეტინგული — მხოლოდ თქვენი თანხმობით.\n\n## თქვენი უფლებები\nშეგიძლიათ მოითხოვოთ თქვენი მონაცემების ნახვა, შესწორება ან წაშლა — მოგვწერეთ.",
        "## What we collect\nYour name, email, phone and stay details — only to handle your booking and communicate with you.\n\n## Cookies\nEssential cookies make the site work; analytics and marketing cookies are used only with your consent.\n\n## Your rights\nYou can ask to see, correct or delete your data at any time — just write to us.",
        "## Какие данные мы собираем\nИмя, e-mail, телефон и детали проживания — только для бронирования и связи с вами.\n\n## Cookie\nНеобходимые cookie обеспечивают работу сайта; аналитические и маркетинговые — только с вашего согласия.\n\n## Ваши права\nВы можете запросить просмотр, исправление или удаление ваших данных — напишите нам.",
      ),
    },
  ];
  for (const [i, p] of policies.entries()) {
    await db.policy.upsert({ where: { slug: p.slug }, update: {}, create: { ...p, sortOrder: i } });
  }

  // ── Page content ──
  const pages: Record<string, { sections: Record<string, ReturnType<typeof t>>; seoTitle?: ReturnType<typeof t>; seoDescription?: ReturnType<typeof t> }> = {
    home: {
      sections: {
        heroTitle: t("სიმშვიდე შავი ზღვის პირას", "Calm by the Black Sea", "Спокойствие у Чёрного моря"),
        heroSubtitle: t("თანამედროვე სასტუმრო ქობულეთში — ღია აუზით, რესტორნით და პლაჟთან წვდომით.", "A modern hotel in Kobuleti with an outdoor pool, a restaurant and beach access.", "Современный отель в Кобулети с открытым бассейном, рестораном и выходом к пляжу."),
        welcomeTitle: t("ზღვის ჰაერი, ნელი დილა და მასპინძლობა, რომელიც გემახსოვრებათ", "Sea air, slow mornings and hospitality you'll remember", "Морской воздух, неспешные утра и гостеприимство, которое запомнится"),
        welcomeText: t(
          "როიალ პალასი ქობულეთის მთავარ გამზირზეა — ზღვასთან ახლოს, მაგრამ ქალაქის ხმაურისგან მოშორებით. ნათელი ნომრები, ღია აუზი და რესტორანი ქმნის იმ მშვიდ რიტმს, რისთვისაც ზღვაზე ჩამოდიხართ.",
          "Royal Palace sits on Kobuleti's main avenue — close to the sea, yet away from the noise. Bright rooms, an outdoor pool and a restaurant set the calm rhythm you come to the seaside for.",
          "Royal Palace расположен на главном проспекте Кобулети — рядом с морем, но вдали от шума. Светлые номера, открытый бассейн и ресторан задают тот спокойный ритм, ради которого едут к морю.",
        ),
        beachText: t(
          "ქობულეთის 10-კილომეტრიანი პლაჟი სასტუმროდან სულ ახლოსაა, ბათუმი კი — ნახევარ საათში.",
          "Kobuleti's 10-kilometre beach is right nearby, and Batumi is half an hour away.",
          "10-километровый пляж Кобулети совсем рядом, а Батуми — в получасе езды.",
        ),
      },
    },
  };
  for (const [key, p] of Object.entries(pages)) {
    await db.page.upsert({ where: { key }, update: {}, create: { key, sections: p.sections, seoTitle: p.seoTitle, seoDescription: p.seoDescription } });
  }

  // ── Gallery order ──
  const galleryOrder = [m.hero, m.exterior1, m.pool1, m.lobby, m.restaurant1, m.view1, m.beach1, m.pool2, m.restaurant2, m.exterior2, m.beach2, m.garden];
  for (const [i, img] of galleryOrder.entries()) if (img.id) await db.media.update({ where: { id: img.id }, data: { galleryOrder: i, inGallery: true } });

  console.log("Done. Owner login:", email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
