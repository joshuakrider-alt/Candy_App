-- Neighborhood snack marketplace schema for The Candy Lady.

create table if not exists profiles (
  user_id text primary key,
  name text not null,
  email text,
  role text not null default 'buyer',
  shop_id integer,
  identity_status text not null default 'unstarted',
  created_at timestamptz not null default now(),
  constraint ck_profiles_role check (role in ('buyer', 'seller', 'admin')),
  constraint ck_profiles_identity check (
    identity_status in ('unstarted', 'processing', 'verified', 'canceled')
  )
);

create table if not exists shops (
  id serial primary key,
  owner_user_id text,
  shop_name text not null,
  contact_name text not null,
  neighborhood text not null,
  pickup_window text not null,
  status text not null default 'pending',
  identity_verified boolean not null default false,
  photo_path text,
  created_at timestamptz not null default now(),
  constraint ck_shops_status check (status in ('pending', 'approved', 'rejected'))
);

create index if not exists shops_status_idx on shops (status);
create index if not exists shops_owner_idx on shops (owner_user_id);

create table if not exists catalog (
  id serial primary key,
  name text not null unique,
  description text not null,
  price_cents integer not null,
  category text not null,
  image_path text not null,
  constraint ck_catalog_category check (category in ('candy', 'chips', 'drinks')),
  constraint ck_catalog_price check (price_cents > 0)
);

create table if not exists inventory (
  id serial primary key,
  shop_id integer not null references shops (id) on delete cascade,
  catalog_id integer not null references catalog (id) on delete cascade,
  inventory_count integer not null default 0,
  constraint uq_inventory unique (shop_id, catalog_id),
  constraint ck_inventory_count check (inventory_count >= 0)
);

create index if not exists inventory_shop_idx on inventory (shop_id);

create table if not exists orders (
  id serial primary key,
  user_id text,
  shop_id integer not null references shops (id),
  total_cents integer not null,
  platform_fee_cents integer not null default 0,
  status text not null default 'new',
  payment_status text not null default 'paid',
  pickup_code text,
  buyer_name text not null default 'Neighbor',
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint ck_orders_status check (status in ('new', 'packing', 'ready', 'completed')),
  constraint ck_orders_payment check (payment_status in ('paid', 'refunded'))
);

create index if not exists orders_user_idx on orders (user_id);
create index if not exists orders_shop_idx on orders (shop_id);

create table if not exists order_items (
  id serial primary key,
  order_id integer not null references orders (id) on delete cascade,
  catalog_id integer not null references catalog (id),
  name text not null,
  quantity integer not null,
  unit_price_cents integer not null,
  constraint ck_order_items_qty check (quantity > 0)
);
