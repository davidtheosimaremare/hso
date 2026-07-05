-- Tambahkan kolom item_seq ke tabel shipments untuk melacak split-row
ALTER TABLE shipments 
ADD COLUMN IF NOT EXISTS item_seq integer;

-- Tambahkan kolom so_note ke tabel shipments (opsional, untuk pencocokan)
ALTER TABLE shipments 
ADD COLUMN IF NOT EXISTS so_note text;
