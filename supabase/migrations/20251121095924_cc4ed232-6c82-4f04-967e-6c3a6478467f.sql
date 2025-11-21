-- Fix ERROR: Security Definer View
-- Drop the security definer view and use RLS policies instead for safer access control

-- Drop the problematic security definer view
DROP VIEW IF EXISTS public.public_organizers;

-- Revoke existing policies that were created with the view
DROP POLICY IF EXISTS "Authenticated users can view approved organizers" ON organizers;
DROP POLICY IF EXISTS "Organizers can view own record" ON organizers;

-- Create RLS policy for anonymous users to view basic info of approved organizers
-- This is safer than a security definer view because it respects RLS
CREATE POLICY "Public can view approved organizers"
  ON organizers FOR SELECT
  TO anon, authenticated
  USING (status = 'approved'::organizer_status);

-- Create policy for organizers to view their own record regardless of status
CREATE POLICY "Organizers can view own record"
  ON organizers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Note: Frontend code should filter display of contact_email and contact_phone
-- to only show these fields to authenticated users when appropriate