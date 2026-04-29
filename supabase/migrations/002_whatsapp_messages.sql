-- WhatsApp Messages Table
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id          uuid primary key default uuid_generate_v4(),
  lead_id     uuid references leads(id) on delete cascade,
  build_id    uuid references builds(id) on delete set null,
  phone       text not null,
  message     text not null,
  status      text not null default 'sent', -- sent | failed
  sent_at     timestamptz default now(),
  created_at  timestamptz default now()
);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on whatsapp_messages" ON whatsapp_messages FOR ALL USING (true) WITH CHECK (true);

-- Add whatsapp_sent column to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_sent boolean default false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;
