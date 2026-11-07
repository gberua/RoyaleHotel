-- Real Google reviews of the hotel (listed on Google as "Royal Palace", D. Agmashenebeli 290a, Kobuleti),
-- copied word for word on 2026-11-08. Google shows only relative dates ("3 years ago"), so "publishedAt"
-- is the approximate month. Runs once per database; "externalId" is unique, so it can never duplicate a review.
-- After this, reviews are managed in Admin → Reviews.
INSERT INTO "Review" ("id", "source", "status", "authorName", "rating", "body", "locale", "featured", "externalId", "publishedAt", "createdAt") VALUES
  ('google-nani-beruchashvili', 'GOOGLE', 'APPROVED', 'Nani Beruchashvili', 5, 'We had a fantastic stay. The staff were friendly and helpful, the food was excellent, and the chef prepared everything perfectly. The pool was clean, the hotel was well-maintained, and the location was ideal. Highly recommended✅️', 'en', true, 'google:nani-beruchashvili', '2026-09-01', NOW()),
  ('google-flor', 'GOOGLE', 'APPROVED', 'FLÖR', 5, 'best hotel🪄', 'en', false, 'google:flor', '2025-10-01', NOW()),
  ('google-zaza-nemsadze', 'GOOGLE', 'APPROVED', 'zaza nemsadze', 5, 'dzalian kargi', 'ka', false, 'google:zaza-nemsadze', '2025-10-01', NOW()),
  ('google-taflan', 'GOOGLE', 'APPROVED', 'TAFLAN', 5, 'They have great hospitality, the pool is quite nice, and the food is also very good. I highly recommend it.', 'en', true, 'google:taflan', '2024-09-01', NOW()),
  ('google-ylna-sadary', 'GOOGLE', 'APPROVED', 'Ylna Sadary', 4, 'Amazing stay, will be back bopefully. Loved the room, the service, the cleaners, the balcony, and Lana!', 'en', true, 'google:ylna-sadary', '2024-09-01', NOW()),
  ('google-przemyslaw-kostrzewski', 'GOOGLE', 'APPROVED', 'Przemysław Kostrzewski', 5, 'Food was really good. We tried a lot of dishes and everything was delicious. There was a little problem with english but what for are translators. You should try.', 'en', true, 'google:przemyslaw-kostrzewski', '2023-09-01', NOW()),
  ('google-levan-benashvili', 'GOOGLE', 'APPROVED', 'Levan Benashvili', 5, 'Best restrong, delishes food ...wine 🍷🍷 best and singer super...', 'en', false, 'google:levan-benashvili', '2023-09-01', NOW()),
  ('google-nino-m', 'GOOGLE', 'APPROVED', 'Nino M', 5, 'Great place, with delicious food, nice service and friendly staff', 'en', false, 'google:nino-m', '2023-09-01', NOW()),
  ('google-giorgi-danelia', 'GOOGLE', 'APPROVED', 'Giorgi Danelia', 5, 'Delicious food🤩🤩🤩best atmosphere and staff🥰🥰🥰', 'en', false, 'google:giorgi-danelia', '2023-09-01', NOW())
ON CONFLICT ("externalId") DO NOTHING;
