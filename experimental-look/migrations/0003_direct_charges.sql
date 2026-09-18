-- Direct Charges + Stripe Connect Express (platform never holds seller funds).

alter table shops add column if not exists stripe_account_id text;
alter table shops add column if not exists connect_status text not null default 'unstarted';
alter table shops add column if not exists charges_enabled boolean not null default false;
alter table shops add column if not exists payouts_enabled boolean not null default false;
alter table shops add column if not exists connect_completed_at timestamptz;

alter table orders add column if not exists stripe_payment_intent_id text;
alter table orders add column if not exists charge_model text not null default 'direct';
alter table orders add column if not exists stripe_fee_cents integer not null default 0;
alter table orders add column if not exists seller_net_cents integer not null default 0;
