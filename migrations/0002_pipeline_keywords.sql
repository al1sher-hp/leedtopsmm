-- pipeline_runs.keywords VARCHAR(255) xatosi ("value too long for type
-- character varying(255)") allaqachon TEXT'ga o'tkazish orqali tuzatilgan
-- (qarang: git commit 0fdeb4f, src/db/models.js'dagi PipelineRun.keywords).
-- Bu ALTER shu holatni yangi/eski bazalarda ham kafolatlaydi (agar
-- allaqachon TEXT bo'lsa — no-op, xavfsiz qayta ishga tushiriladi).
ALTER TABLE pipeline_runs ALTER COLUMN keywords TYPE TEXT;

-- Qo'shimcha normalizatsiya jadvali — bitta pipeline_run bir nechta kalit
-- so'zga ega bo'lishi mumkin, vergul bilan qo'shilgan TEXT ustuni o'rniga
-- (yoki unga qo'shimcha ravishda) har bir kalit so'z alohida qatorda.
CREATE TABLE IF NOT EXISTS pipeline_keywords (
  id SERIAL PRIMARY KEY,
  pipeline_run_id INTEGER NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  UNIQUE (pipeline_run_id, keyword)
);

CREATE INDEX IF NOT EXISTS pipeline_keywords_run_id_idx ON pipeline_keywords (pipeline_run_id);

-- Mavjud vergul bilan ajratilgan pipeline_runs.keywords qatorlarini
-- normalizatsiya jadvaliga ko'chirish (idempotent — ON CONFLICT DO NOTHING).
INSERT INTO pipeline_keywords (pipeline_run_id, keyword)
SELECT pr.id, trim(kw)
FROM pipeline_runs pr, unnest(string_to_array(pr.keywords, ',')) AS kw
WHERE pr.keywords IS NOT NULL AND trim(kw) <> ''
ON CONFLICT (pipeline_run_id, keyword) DO NOTHING;
