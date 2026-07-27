-- Luciole India Hair: transactional PostgreSQL schema for private contribution groups.
-- Run with a PostgreSQL role allowed to create extensions, tables, functions and RLS policies.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('customer', 'general_admin', 'payment_manager', 'suspended');
CREATE TYPE group_privacy AS ENUM ('private', 'discoverable');
CREATE TYPE group_status AS ENUM ('funding', 'funded', 'awaiting_stock', 'ordered', 'completed', 'suspended');
CREATE TYPE member_status AS ENUM ('pending', 'accepted', 'refused', 'cancelled', 'removed', 'left');
CREATE TYPE member_role AS ENUM ('member', 'group_admin', 'beneficiary');
CREATE TYPE contribution_status AS ENUM ('draft', 'declared', 'under_review', 'confirmed', 'refused', 'cancelled', 'refund_requested', 'refunded');
CREATE TYPE order_status AS ENUM ('awaiting_address', 'processing', 'shipped', 'delivered', 'cancelled');

CREATE TABLE "users" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  phone text UNIQUE,
  full_name text NOT NULL,
  avatar_url text,
  role user_role NOT NULL DEFAULT 'customer',
  suspended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  availability text NOT NULL DEFAULT 'available',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text UNIQUE,
  length text,
  texture text,
  color text,
  density text,
  price integer NOT NULL CHECK (price > 0),
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contribution_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  creator_id uuid NOT NULL REFERENCES "users"(id),
  beneficiary_id uuid NOT NULL REFERENCES "users"(id),
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  target_amount integer NOT NULL CHECK (target_amount > 0),
  price_snapshot jsonb NOT NULL,
  privacy group_privacy NOT NULL DEFAULT 'private',
  presentation_message text,
  image_path text,
  status group_status NOT NULL DEFAULT 'funding',
  funded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES contribution_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  status member_status NOT NULL DEFAULT 'pending',
  write_restricted_until timestamptz,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE group_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES contribution_groups(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  invited_email text,
  invited_phone text,
  created_by uuid NOT NULL REFERENCES "users"(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_by uuid REFERENCES "users"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (invited_email IS NOT NULL OR invited_phone IS NOT NULL OR token IS NOT NULL)
);

CREATE TABLE join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES contribution_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  status member_status NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'refused', 'cancelled')),
  reviewed_by uuid REFERENCES "users"(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE TABLE contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES contribution_groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES "users"(id),
  amount integer NOT NULL CHECK (amount > 0),
  sender_phone text,
  sender_name text,
  transaction_reference text,
  transferred_at timestamptz,
  proof_path text,
  member_note text,
  status contribution_status NOT NULL DEFAULT 'draft',
  refusal_reason text,
  verified_by uuid REFERENCES "users"(id),
  verified_at timestamptz,
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('refused') OR refusal_reason IS NOT NULL),
  CHECK (status NOT IN ('confirmed') OR (verified_by IS NOT NULL AND verified_at IS NOT NULL))
);

-- A reference may never contribute to two confirmed payments, even across groups.
CREATE UNIQUE INDEX confirmed_transaction_reference_unique
  ON contributions (transaction_reference)
  WHERE status = 'confirmed' AND transaction_reference IS NOT NULL;
CREATE INDEX contributions_group_status_idx ON contributions (group_id, status);
CREATE INDEX group_members_user_status_idx ON group_members (user_id, status);

CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id uuid NOT NULL UNIQUE REFERENCES contributions(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'orange_money',
  provider_reference text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES contribution_groups(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES "users"(id),
  parent_message_id uuid REFERENCES group_messages(id),
  content text NOT NULL CHECK (length(trim(content)) > 0),
  pinned_at timestamptz,
  deleted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX group_messages_group_created_idx ON group_messages (group_id, created_at);

CREATE TABLE group_message_reads (
  message_id uuid NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  private_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES group_messages(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES "users"(id),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_id)
);
CREATE TABLE group_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES contribution_groups(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES "users"(id),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid UNIQUE REFERENCES contribution_groups(id),
  purchaser_id uuid REFERENCES "users"(id),
  beneficiary_id uuid REFERENCES "users"(id),
  status order_status NOT NULL DEFAULT 'awaiting_address',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  variant_id uuid REFERENCES product_variants(id),
  product_snapshot jsonb NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price integer NOT NULL CHECK (unit_price > 0)
);
CREATE TABLE delivery_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  address_line text NOT NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES "users"(id),
  group_id uuid REFERENCES contribution_groups(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  is_secret boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Server transaction entry point. The API must set app.current_user_id from its verified session.
CREATE OR REPLACE FUNCTION confirm_contribution(p_contribution_id uuid, p_internal_note text DEFAULT NULL)
RETURNS contributions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
  v_contribution contributions;
  v_target integer;
  v_confirmed integer;
BEGIN
  SELECT * INTO v_contribution FROM contributions WHERE id = p_contribution_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contribution introuvable'; END IF;
  IF (SELECT role FROM "users" WHERE id = v_actor) NOT IN ('general_admin', 'payment_manager') THEN
    RAISE EXCEPTION 'Permission refusée';
  END IF;
  IF v_contribution.member_id = v_actor THEN RAISE EXCEPTION 'Auto-validation interdite'; END IF;
  IF v_contribution.status = 'confirmed' THEN RAISE EXCEPTION 'Paiement déjà confirmé'; END IF;
  SELECT target_amount INTO v_target FROM contribution_groups WHERE id = v_contribution.group_id FOR UPDATE;
  SELECT COALESCE(sum(amount), 0) INTO v_confirmed FROM contributions
    WHERE group_id = v_contribution.group_id AND status = 'confirmed';
  IF v_contribution.amount > v_target - v_confirmed THEN RAISE EXCEPTION 'Montant supérieur au reste'; END IF;
  IF EXISTS (SELECT 1 FROM contributions WHERE transaction_reference = v_contribution.transaction_reference
             AND status = 'confirmed' AND id <> v_contribution.id) THEN
    RAISE EXCEPTION 'Référence déjà confirmée';
  END IF;
  UPDATE contributions SET status = 'confirmed', verified_by = v_actor, verified_at = now(), internal_note = p_internal_note
    WHERE id = p_contribution_id RETURNING * INTO v_contribution;
  INSERT INTO audit_logs(actor_id, group_id, action, entity_type, entity_id)
    VALUES (v_actor, v_contribution.group_id, 'contribution_confirmed', 'contribution', v_contribution.id);
  RETURN v_contribution;
END;
$$;

-- RLS is a defence-in-depth layer; API authorization must additionally use verified sessions.
ALTER TABLE contribution_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY groups_member_read ON contribution_groups FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = id
          AND gm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid AND gm.status = 'accepted')
);
CREATE POLICY members_group_read ON group_members FOR SELECT USING (
  user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid OR
  EXISTS (SELECT 1 FROM group_members own WHERE own.group_id = group_members.group_id
          AND own.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid AND own.status = 'accepted')
);
CREATE POLICY contributions_accepted_member_read ON contributions FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = contributions.group_id
          AND gm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid AND gm.status = 'accepted')
);
CREATE POLICY contributions_member_declare ON contributions FOR INSERT WITH CHECK (
  member_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid AND
  status IN ('draft', 'declared') AND
  EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = contributions.group_id
          AND gm.user_id = contributions.member_id AND gm.status = 'accepted')
);
CREATE POLICY messages_accepted_member_read ON group_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_messages.group_id
          AND gm.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid AND gm.status = 'accepted')
);
CREATE POLICY messages_accepted_member_send ON group_messages FOR INSERT WITH CHECK (
  author_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid AND
  EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_messages.group_id
          AND gm.user_id = group_messages.author_id AND gm.status = 'accepted'
          AND (gm.write_restricted_until IS NULL OR gm.write_restricted_until < now()))
);
CREATE POLICY messages_author_edit_window ON group_messages FOR UPDATE USING (
  author_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid AND
  created_at > now() - interval '15 minutes' AND deleted_at IS NULL
) WITH CHECK (
  author_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);
