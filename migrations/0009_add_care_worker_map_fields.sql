-- Add address and geocoding fields to care_workers table for map display
ALTER TABLE care_workers 
  ADD COLUMN address TEXT,
  ADD COLUMN postcode TEXT,
  ADD COLUMN latitude INTEGER,
  ADD COLUMN longitude INTEGER;

-- Create index for faster postcode lookups
CREATE INDEX IF NOT EXISTS care_workers_postcode_idx ON care_workers(postcode);
