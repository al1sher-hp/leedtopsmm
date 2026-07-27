-- Guruh lead'lar: ochiq Telegram kanal postlari va kommentlaridan (faqat
-- XABAR MATNIDA yozilgan) telefon raqamlarini yig'ish uchun jadvallar.
-- Qayta ishga tushirish xavfsiz (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).

CREATE TABLE IF NOT EXISTS lead_sources (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('channel_posts', 'channel_comments')),
  title TEXT,
  username TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Sahifalash kursori: channel_posts uchun oxirgi ko'rilgan post message_id,
  -- channel_comments uchun oxirgi tekshirilgan POST'ning message_id'i
  -- (izohlar shu postgacha allaqachon tekshirilgan degani).
  last_seen_msg INTEGER NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bitta @username bir necha marta (bir xil kind bilan) qo'shilib
-- ketmasin — lekin xohlasa bitta kanalni HAM channel_posts, HAM
-- channel_comments sifatida qo'shish mumkin (ikkisi mustaqil manba).
CREATE UNIQUE INDEX IF NOT EXISTS lead_sources_username_kind_idx
  ON lead_sources (lower(username), kind);

-- Opt-out qilingan raqamlar — reklama auditoriyasidan butunlay chiqarib
-- tashlanadi (qarang: group_leads_apply_suppression() trigger'i pastda).
CREATE TABLE IF NOT EXISTS suppression_list (
  phone_e164 TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_leads (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES lead_sources(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL,
  -- Faqat xabar matnidan olingan raqamlar — profil maydonidan yig'ish
  -- shu CHECK bilan sxema darajasida taqiqlangan (kod darajasida ham
  -- hech qanday yo'l shu ustunga boshqa qiymat yozmaydi).
  phone_origin TEXT NOT NULL DEFAULT 'message_text'
    CHECK (phone_origin IN ('message_text')),
  username TEXT,
  display_name TEXT,
  message_id BIGINT,
  message_url TEXT,
  message_text TEXT,
  matched_kw TEXT,
  posted_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new',
  opted_out BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (phone_e164, source_id)
);

CREATE INDEX IF NOT EXISTS group_leads_source_id_idx ON group_leads (source_id);
CREATE INDEX IF NOT EXISTS group_leads_phone_e164_idx ON group_leads (phone_e164);
CREATE INDEX IF NOT EXISTS group_leads_opted_out_idx ON group_leads (opted_out);

-- Yangi yig'ilgan lead suppression ro'yxatida allaqachon bo'lsa,
-- INSERT paytida DB darajasida darhol opted_out=true qilib belgilanadi —
-- ilova kodi tekshiruvni unutib qo'ysa ham (masalan kelajakda qo'shiladigan
-- boshqa insert yo'li) bu himoya buzilmaydi.
CREATE OR REPLACE FUNCTION group_leads_apply_suppression() RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM suppression_list WHERE phone_e164 = NEW.phone_e164) THEN
    NEW.opted_out := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_leads_suppression_trigger ON group_leads;
CREATE TRIGGER group_leads_suppression_trigger
  BEFORE INSERT ON group_leads
  FOR EACH ROW
  EXECUTE FUNCTION group_leads_apply_suppression();

CREATE TABLE IF NOT EXISTS export_batches (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INTEGER NOT NULL DEFAULT 0,
  hashed BOOLEAN NOT NULL DEFAULT false
);

-- Bir odam bir necha manbada (yoki bir manbada bir necha marta, turli
-- postlarda) topilishi mumkin — eksportda har bir raqam faqat bitta marta
-- chiqishi kerak. DISTINCT ON eng so'nggi (id bo'yicha) yozuvni tanlaydi.
CREATE OR REPLACE VIEW exportable_leads AS
SELECT DISTINCT ON (gl.phone_e164) gl.*
FROM group_leads gl
WHERE gl.opted_out = false
ORDER BY gl.phone_e164, gl.id DESC;
