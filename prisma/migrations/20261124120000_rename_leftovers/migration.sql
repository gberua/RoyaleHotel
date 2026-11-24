-- Second pass of the rename to "Royal Palace". The first migration covered settings, pages, the suite and
-- logins; this one covers every other text the hotel edits (offers, FAQ, policies, e-mail templates,
-- services, attractions, extras, photo descriptions …) and the Georgian case forms ("როიალ ჰოტელში",
-- "როიალ ჰოტელის"), by replacing the stem. Guests' own words (reviews, messages), bookings and the
-- activity log are left as written. Safe to run more than once.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('jsonb', 'text')
      AND table_name IN ('Setting', 'Page', 'RoomType', 'Offer', 'FaqItem', 'Policy', 'EmailTemplate', 'Service',
                         'Attraction', 'Amenity', 'Extra', 'Season', 'OccupancyRule', 'Media')
      AND column_name NOT IN ('id', 'key', 'slug', 'locale', 'icon', 'category', 'url', 'avifUrl', 'blurDataUrl',
                              'dominantColor', 'checksum', 'sourceFile', 'creditUrl', 'promoCode')
  LOOP
    EXECUTE format(
      'UPDATE %1$I SET %2$I = replace(replace(replace(replace(%2$I::text,
           ''Royale Hotel'', ''Royal Palace''), ''Royale Palace'', ''Royal Palace''),
           ''როიალ ჰოტელ'', ''როიალ პალას''), ''royalehotel.ge'', ''royalpalacehotel.ge'')::%3$s
       WHERE %2$I::text ~ ''Royale (Hotel|Palace)|როიალ ჰოტელ|royalehotel\.ge''',
      c.table_name, c.column_name, c.data_type);
  END LOOP;
END $$;
