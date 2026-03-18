-- Add summary column to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS summary text;
