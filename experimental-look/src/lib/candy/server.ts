import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { CATALOG_SEED, SHOP_SEED } from "./catalog-seed";
import { platformFeeCents, splitCharge, stockLabel } from "./money";
import type {
  AdminStats,
  CatalogItem,
  ConnectStatus,
  InventoryItem,
  OrderView,
  Profile,
  SellerLedger,
  ShopCard,
} from "./types";

const PICKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type ShopRow = {
  id: number;
  owner_user_id: string | null;
  shop_name: string;
  contact_name: string;
  neighborhood: string;
  pickup_window: string;
  status: ShopCard["status"];
  identity_verified: boolean;
  photo_path: string | null;
  in_stock_count?: number;
  stripe_account_id: string | null;
  connect_status: ConnectStatus;
  charges_enabled: boolean;
  payouts_enabled: boolean;
};

type CatalogRow = {
  id: number;
  name: string;
  description: string;
  price_cents: number;
  category: CatalogItem["category"];
  image_path: string;
};

type InventoryRow = CatalogRow & { inventory_count: number };

type ProfileRow = {
  user_id: string;
  name: string;
  email: string | null;
  role: Profile["role"];
  shop_id: number | null;
  identity_status: Profile["identityStatus"];
};

type OrderRow = {
  id: number;
  user_id: string | null;
  shop_id: number;
  shop_name: string;
  neighborhood: string;
  total_cents: number;
  platform_fee_cents: number;
  stripe_fee_cents: number | null;
  seller_net_cents: number | null;
  status: OrderView["status"];
  payment_status: string;
  pickup_code: string | null;
  buyer_name: string;
  created_at: string;
  charge_model: string | null;
  stripe_payment_intent_id: string | null;
};

type OrderItemRow = {
  id: number;
  catalog_id: number;
  name: string;
  quantity: number;
  unit_price_cents: number;
};

let seedPromise: Promise<void> | null = null;

function mapShop(row: ShopRow): ShopCard {
  return {
    id: row.id,
    shopName: row.shop_name,
    contactName: row.contact_name,
    neighborhood: row.neighborhood,
    pickupWindow: row.pickup_window,
    status: row.status,
    identityVerified: Boolean(row.identity_verified),
    photoPath: row.photo_path,
    inStockCount: Number(row.in_stock_count ?? 0),
    stripeAccountId: row.stripe_account_id,
    connectStatus: row.connect_status ?? "unstarted",
    chargesEnabled: Boolean(row.charges_enabled),
    payoutsEnabled: Boolean(row.payouts_enabled),
  };
}

function mapCatalog(row: CatalogRow): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    category: row.category,
    imagePath: row.image_path,
  };
}

function mapInventory(row: InventoryRow): InventoryItem {
  return {
    ...mapCatalog(row),
    inventoryCount: row.inventory_count,
    stock: stockLabel(row.inventory_count),
  };
}

function mapProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    shopId: row.shop_id,
    identityStatus: row.identity_status,
  };
}

function mapOrder(row: OrderRow, items: OrderItemRow[]): OrderView {
  const split = splitCharge(row.total_cents);
  const stripe = row.stripe_fee_cents && row.stripe_fee_cents > 0 ? row.stripe_fee_cents : split.stripeFeeCents;
  const net = row.seller_net_cents && row.seller_net_cents > 0 ? row.seller_net_cents : split.sellerNetCents;
  return {
    id: row.id,
    shopId: row.shop_id,
    shopName: row.shop_name,
    neighborhood: row.neighborhood,
    totalCents: row.total_cents,
    platformFeeCents: row.platform_fee_cents,
    stripeFeeCents: stripe,
    sellerPayoutCents: net,
    status: row.status,
    paymentStatus: row.payment_status,
    pickupCode: row.pickup_code,
    buyerName: row.buyer_name,
    createdAt: row.created_at,
    chargeModel: row.charge_model ?? "direct",
    paymentIntentId: row.stripe_payment_intent_id,
    items: items.map((item) => ({
      id: item.id,
      catalogId: item.catalog_id,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
    })),
  };
}

async function backfillConnect(sql: Awaited<ReturnType<typeof getSql>>): Promise<void> {
  await sql`
    update shops
    set
      stripe_account_id = coalesce(stripe_account_id, 'acct_seed_' || id::text),
      connect_status = 'complete',
      charges_enabled = true,
      payouts_enabled = true,
      connect_completed_at = coalesce(connect_completed_at, now())
    where owner_user_id is null
      and status = 'approved'
      and connect_status = 'unstarted'
  `;
}

async function ensureSeed(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const sql = await getSql();
      const existing = await sql<{ n: number }>`select count(*)::int as n from catalog`;
      if ((existing[0]?.n ?? 0) === 0) {
        for (const item of CATALOG_SEED) {
          await sql`
            insert into catalog (name, description, price_cents, category, image_path)
            values (${item.name}, ${item.description}, ${item.priceCents}, ${item.category}, ${item.imagePath})
            on conflict (name) do nothing
          `;
        }

        const catalogRows = await sql<CatalogRow>`select * from catalog`;

        for (const spec of SHOP_SEED) {
          const inserted = await sql<{ id: number }>`
            insert into shops (
              shop_name, contact_name, neighborhood, pickup_window, status, identity_verified, photo_path
            )
            values (
              ${spec.shopName}, ${spec.contactName}, ${spec.neighborhood}, ${spec.pickupWindow},
              ${spec.status}, ${spec.identityVerified}, ${spec.photoPath}
            )
            returning id
          `;
          const shopId = inserted[0]?.id;
          if (!shopId) continue;
          for (const item of catalogRows) {
            const count = spec.stock[item.name] ?? 0;
            await sql`
              insert into inventory (shop_id, catalog_id, inventory_count)
              values (${shopId}, ${item.id}, ${count})
              on conflict (shop_id, catalog_id) do nothing
            `;
          }
        }
      }

      await backfillConnect(sql);
    })().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}

async function attachItems(orders: OrderRow[]): Promise<OrderView[]> {
  if (!orders.length) return [];
  const grouped = new Map<number, OrderItemRow[]>();
  for (const order of orders) {
    grouped.set(order.id, await loadOrderItems(order.id));
  }
  return orders.map((order) => mapOrder(order, grouped.get(order.id) ?? []));
}

async function loadOrderItems(orderId: number): Promise<OrderItemRow[]> {
  const sql = await getSql();
  return sql<OrderItemRow>`
    select id, catalog_id, name, quantity, unit_price_cents
    from order_items where order_id = ${orderId}
  `;
}

function pickupCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  let body = "";
  for (const byte of bytes) {
    body += PICKUP_ALPHABET[byte % PICKUP_ALPHABET.length];
  }
  return `CL-${body}`;
}

function paymentIntentId(): string {
  return `pi_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`;
}

async function upsertProfile(
  userId: string,
  name?: string,
  email?: string,
): Promise<Profile> {
  const sql = await getSql();
  const existing = await sql<ProfileRow>`select * from profiles where user_id = ${userId}`;
  if (existing[0]) {
    if (name || email) {
      const nextName = name?.trim() || existing[0].name;
      const nextEmail = email?.trim() || existing[0].email;
      const updated = await sql<ProfileRow>`
        update profiles
        set name = ${nextName}, email = ${nextEmail}
        where user_id = ${userId}
        returning *
      `;
      return mapProfile(updated[0] ?? existing[0]);
    }
    return mapProfile(existing[0]);
  }

  const admins = await sql<{ n: number }>`select count(*)::int as n from profiles where role = 'admin'`;
  const role = (admins[0]?.n ?? 0) === 0 ? "admin" : "buyer";
  const display = name?.trim() || email?.split("@")[0] || "Neighbor";
  const inserted = await sql<ProfileRow>`
    insert into profiles (user_id, name, email, role)
    values (${userId}, ${display}, ${email ?? null}, ${role})
    returning *
  `;
  return mapProfile(inserted[0]!);
}

async function requireProfile(userId: string): Promise<Profile> {
  return upsertProfile(userId);
}

export const listShops = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSeed();
  const sql = await getSql();
  const rows = await sql<ShopRow>`
    select
      s.id, s.owner_user_id, s.shop_name, s.contact_name, s.neighborhood,
      s.pickup_window, s.status, s.identity_verified, s.photo_path,
      s.stripe_account_id, s.connect_status, s.charges_enabled, s.payouts_enabled,
      (
        select count(*)::int from inventory i
        where i.shop_id = s.id and i.inventory_count > 0
      ) as in_stock_count
    from shops s
    where s.status = 'approved'
    order by s.shop_name
  `;
  return rows.map(mapShop);
});

export const getShop = createServerFn({ method: "GET" })
  .validator(z.object({ shopId: z.number() }))
  .handler(async ({ data }) => {
    await ensureSeed();
    const sql = await getSql();
    const shops = await sql<ShopRow>`
      select
        s.id, s.owner_user_id, s.shop_name, s.contact_name, s.neighborhood,
        s.pickup_window, s.status, s.identity_verified, s.photo_path,
        s.stripe_account_id, s.connect_status, s.charges_enabled, s.payouts_enabled,
        (
          select count(*)::int from inventory i
          where i.shop_id = s.id and i.inventory_count > 0
        ) as in_stock_count
      from shops s
      where s.id = ${data.shopId}
    `;
    const shop = shops[0];
    if (!shop || shop.status !== "approved") return null;
    const items = await sql<InventoryRow>`
      select c.id, c.name, c.description, c.price_cents, c.category, c.image_path, i.inventory_count
      from inventory i
      join catalog c on c.id = i.catalog_id
      where i.shop_id = ${data.shopId}
      order by c.category, c.name
    `;
    return { shop: mapShop(shop), items: items.map(mapInventory) };
  });

export const listCatalog = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSeed();
  const sql = await getSql();
  const rows = await sql<CatalogRow>`select * from catalog order by category, name`;
  return rows.map(mapCatalog);
});

const profileInput = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
});

export const getMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(profileInput)
  .handler(async ({ context, data }) => {
    await ensureSeed();
    return upsertProfile(context.userId, data.name, data.email);
  });

export const applyAsSeller = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      shopName: z.string().min(2).max(80),
      contactName: z.string().min(2).max(80),
      neighborhood: z.string().min(2).max(80),
      pickupWindow: z.string().min(4).max(120),
      name: z.string().optional(),
      email: z.string().optional(),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureSeed();
    const profile = await upsertProfile(context.userId, data.name, data.email);
    if (profile.shopId) {
      const sql = await getSql();
      const shops = await sql<ShopRow>`select * from shops where id = ${profile.shopId}`;
      return { profile, shop: shops[0] ? mapShop(shops[0]) : null, already: true as const };
    }

    const sql = await getSql();
    const inserted = await sql<{ id: number }>`
      insert into shops (
        owner_user_id, shop_name, contact_name, neighborhood, pickup_window, status
      )
      values (
        ${context.userId}, ${data.shopName.trim()}, ${data.contactName.trim()},
        ${data.neighborhood.trim()}, ${data.pickupWindow.trim()}, 'pending'
      )
      returning id
    `;
    const shopId = inserted[0]!.id;
    const catalog = await sql<{ id: number }>`select id from catalog`;
    for (const item of catalog) {
      await sql`
        insert into inventory (shop_id, catalog_id, inventory_count)
        values (${shopId}, ${item.id}, 0)
      `;
    }
    const nextRole = profile.role === "admin" ? "admin" : "seller";
    const updated = await sql<ProfileRow>`
      update profiles
      set shop_id = ${shopId}, role = ${nextRole}, name = ${data.contactName.trim()}
      where user_id = ${context.userId}
      returning *
    `;
    const shops = await sql<ShopRow>`select * from shops where id = ${shopId}`;
    return { profile: mapProfile(updated[0]!), shop: mapShop(shops[0]!), already: false as const };
  });

export const getMyShop = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureSeed();
    const profile = await requireProfile(context.userId);
    if (!profile.shopId) {
      return {
        profile,
        shop: null,
        items: [] as InventoryItem[],
        orders: [] as OrderView[],
        ledger: emptyLedger(),
      };
    }
    const sql = await getSql();
    const shops = await sql<ShopRow>`
      select *, 0 as in_stock_count from shops where id = ${profile.shopId}
    `;
    const shop = shops[0] ? mapShop(shops[0]) : null;
    const items = await sql<InventoryRow>`
      select c.id, c.name, c.description, c.price_cents, c.category, c.image_path, i.inventory_count
      from inventory i
      join catalog c on c.id = i.catalog_id
      where i.shop_id = ${profile.shopId}
      order by c.category, c.name
    `;
    const orders = await sql<OrderRow>`
      select o.*, s.shop_name, s.neighborhood
      from orders o
      join shops s on s.id = o.shop_id
      where o.shop_id = ${profile.shopId}
        and o.payment_status = 'paid'
        and o.status <> 'completed'
      order by o.created_at desc
    `;
    return {
      profile,
      shop,
      items: items.map(mapInventory),
      orders: await attachItems(orders),
      ledger: await loadLedger(profile.shopId),
    };
  });

function emptyLedger(): SellerLedger {
  return {
    paidOrders: 0,
    gmvCents: 0,
    applicationFeeCents: 0,
    stripeFeeCents: 0,
    netCents: 0,
    pendingPayoutCents: 0,
  };
}

async function loadLedger(shopId: number): Promise<SellerLedger> {
  const sql = await getSql();
  const paid = await sql<{
    n: number;
    gmv: number;
    fees: number;
    stripe: number;
    net: number;
  }>`
    select
      count(*)::int as n,
      coalesce(sum(total_cents), 0)::int as gmv,
      coalesce(sum(platform_fee_cents), 0)::int as fees,
      coalesce(sum(stripe_fee_cents), 0)::int as stripe,
      coalesce(sum(seller_net_cents), 0)::int as net
    from orders
    where shop_id = ${shopId} and payment_status = 'paid'
  `;
  const pending = await sql<{ net: number }>`
    select coalesce(sum(seller_net_cents), 0)::int as net
    from orders
    where shop_id = ${shopId} and payment_status = 'paid' and status <> 'completed'
  `;
  return {
    paidOrders: paid[0]?.n ?? 0,
    gmvCents: paid[0]?.gmv ?? 0,
    applicationFeeCents: paid[0]?.fees ?? 0,
    stripeFeeCents: paid[0]?.stripe ?? 0,
    netCents: paid[0]?.net ?? 0,
    pendingPayoutCents: pending[0]?.net ?? 0,
  };
}

export const startConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await requireProfile(context.userId);
    if (!profile.shopId) throw new Error("Apply as a seller first.");
    const sql = await getSql();
    const accountId = `acct_${profile.shopId}_${context.userId.replace(/[^a-z0-9]/gi, "").slice(0, 10)}`;
    const updated = await sql<ShopRow>`
      update shops
      set
        stripe_account_id = coalesce(stripe_account_id, ${accountId}),
        connect_status = 'pending'
      where id = ${profile.shopId}
      returning *, 0 as in_stock_count
    `;
    return { shop: mapShop(updated[0]!) };
  });

export const completeConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await requireProfile(context.userId);
    if (!profile.shopId) throw new Error("Apply as a seller first.");
    const sql = await getSql();
    const accountId = `acct_${profile.shopId}_${context.userId.replace(/[^a-z0-9]/gi, "").slice(0, 10)}`;
    const updated = await sql<ShopRow>`
      update shops
      set
        stripe_account_id = coalesce(stripe_account_id, ${accountId}),
        connect_status = 'complete',
        charges_enabled = true,
        payouts_enabled = true,
        connect_completed_at = now()
      where id = ${profile.shopId}
      returning *, 0 as in_stock_count
    `;
    return { shop: mapShop(updated[0]!) };
  });

export const setStock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ catalogId: z.number(), inventoryCount: z.number().int().min(0).max(999) }))
  .handler(async ({ context, data }) => {
    const profile = await requireProfile(context.userId);
    if (!profile.shopId) throw new Error("No shop on this account.");
    const sql = await getSql();
    await sql`
      update inventory
      set inventory_count = ${data.inventoryCount}
      where shop_id = ${profile.shopId} and catalog_id = ${data.catalogId}
    `;
    return { ok: true as const };
  });

export const verifyIdentity = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const profile = await requireProfile(context.userId);
    const sql = await getSql();
    await sql`
      update profiles set identity_status = 'verified' where user_id = ${context.userId}
    `;
    if (profile.shopId) {
      await sql`update shops set identity_verified = true where id = ${profile.shopId}`;
    }
    return { identityStatus: "verified" as const };
  });

const NEXT_STATUS: Record<string, OrderView["status"]> = {
  new: "packing",
  packing: "ready",
  ready: "completed",
};

export const advanceOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ orderId: z.number() }))
  .handler(async ({ context, data }) => {
    const profile = await requireProfile(context.userId);
    const sql = await getSql();
    const rows = await sql<OrderRow>`
      select o.*, s.shop_name, s.neighborhood, s.owner_user_id
      from orders o
      join shops s on s.id = o.shop_id
      where o.id = ${data.orderId}
    `;
    const order = rows[0];
    if (!order) throw new Error("Order not found.");
    const owns = order.shop_id === profile.shopId;
    const isAdmin = profile.role === "admin";
    if (!owns && !isAdmin) throw new Error("That order is not yours to pack.");
    const next = NEXT_STATUS[order.status];
    if (!next) throw new Error("This order is already complete.");
    await sql`update orders set status = ${next} where id = ${data.orderId}`;
    return { status: next };
  });

export const checkout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      shopId: z.number(),
      buyerName: z.string().min(1).max(80),
      items: z
        .array(z.object({ catalogId: z.number(), quantity: z.number().int().min(1).max(20) }))
        .min(1),
    }),
  )
  .handler(async ({ context, data }) => {
    await ensureSeed();
    const profile = await upsertProfile(context.userId, data.buyerName);
    const sql = await getSql();
    const shops = await sql<ShopRow>`select * from shops where id = ${data.shopId} and status = 'approved'`;
    const shop = shops[0];
    if (!shop) throw new Error("That shop is not taking orders.");
    if (!shop.charges_enabled || !shop.stripe_account_id) {
      throw new Error("This seller has not finished payouts setup yet.");
    }

    const lines: Array<{ catalog: CatalogRow; quantity: number; count: number }> = [];
    for (const item of data.items) {
      const rows = await sql<CatalogRow & { inventory_count: number }>`
        select c.*, i.inventory_count
        from inventory i
        join catalog c on c.id = i.catalog_id
        where i.shop_id = ${data.shopId} and i.catalog_id = ${item.catalogId}
      `;
      const row = rows[0];
      if (!row) throw new Error("An item is not sold at this shop.");
      if (row.inventory_count < item.quantity) {
        throw new Error(`${row.name} just sold down — only ${row.inventory_count} left.`);
      }
      lines.push({ catalog: row, quantity: item.quantity, count: row.inventory_count });
    }

    for (const line of lines) {
      const updated = await sql<{ id: number }>`
        update inventory
        set inventory_count = inventory_count - ${line.quantity}
        where shop_id = ${data.shopId}
          and catalog_id = ${line.catalog.id}
          and inventory_count >= ${line.quantity}
        returning id
      `;
      if (!updated[0]) throw new Error(`${line.catalog.name} sold out while you were checking out.`);
    }

    const totalCents = lines.reduce((sum, line) => sum + line.catalog.price_cents * line.quantity, 0);
    const split = splitCharge(totalCents);
    const fee = platformFeeCents(totalCents);
    const pi = paymentIntentId();
    let code = pickupCode();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const clash = await sql<{ id: number }>`select id from orders where pickup_code = ${code}`;
      if (!clash[0]) break;
      code = pickupCode();
    }

    const inserted = await sql<{ id: number }>`
      insert into orders (
        user_id, shop_id, total_cents, platform_fee_cents, stripe_fee_cents, seller_net_cents,
        status, payment_status, pickup_code, buyer_name, paid_at,
        stripe_payment_intent_id, charge_model
      )
      values (
        ${context.userId}, ${data.shopId}, ${totalCents}, ${fee}, ${split.stripeFeeCents},
        ${split.sellerNetCents}, 'new', 'paid', ${code}, ${profile.name}, now(),
        ${pi}, 'direct'
      )
      returning id
    `;
    const orderId = inserted[0]!.id;
    for (const line of lines) {
      await sql`
        insert into order_items (order_id, catalog_id, name, quantity, unit_price_cents)
        values (${orderId}, ${line.catalog.id}, ${line.catalog.name}, ${line.quantity}, ${line.catalog.price_cents})
      `;
    }

    const orderRows = await sql<OrderRow>`
      select o.*, s.shop_name, s.neighborhood
      from orders o
      join shops s on s.id = o.shop_id
      where o.id = ${orderId}
    `;
    const items = await loadOrderItems(orderId);
    return mapOrder(orderRows[0]!, items);
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureSeed();
    const sql = await getSql();
    const rows = await sql<OrderRow>`
      select o.*, s.shop_name, s.neighborhood
      from orders o
      join shops s on s.id = o.shop_id
      where o.user_id = ${context.userId}
      order by o.created_at desc
    `;
    return attachItems(rows);
  });

export const listAdmin = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await ensureSeed();
    const profile = await requireProfile(context.userId);
    if (profile.role !== "admin") throw new Error("That account is not an admin.");
    const sql = await getSql();
    const pending = await sql<ShopRow>`
      select *, 0 as in_stock_count from shops where status = 'pending' order by created_at desc
    `;
    const allShops = await sql<ShopRow>`
      select *, 0 as in_stock_count from shops order by status, shop_name
    `;
    const paid = await sql<{
      n: number;
      collected: number;
      fees: number;
      net: number;
    }>`
      select
        count(*)::int as n,
        coalesce(sum(total_cents), 0)::int as collected,
        coalesce(sum(platform_fee_cents), 0)::int as fees,
        coalesce(sum(seller_net_cents), 0)::int as net
      from orders
      where payment_status = 'paid'
    `;
    const connected = await sql<{ n: number }>`
      select count(*)::int as n from shops where connect_status = 'complete'
    `;
    const queue = await sql<OrderRow>`
      select o.*, s.shop_name, s.neighborhood
      from orders o
      join shops s on s.id = o.shop_id
      where o.payment_status = 'paid' and o.status <> 'completed'
      order by o.created_at desc
    `;
    const stats: AdminStats = {
      paidOrders: paid[0]?.n ?? 0,
      collectedCents: paid[0]?.collected ?? 0,
      feeEarnedCents: paid[0]?.fees ?? 0,
      paidToSellersCents: paid[0]?.net ?? 0,
      pendingShops: pending.length,
      connectedShops: connected[0]?.n ?? 0,
    };
    return {
      profile,
      stats,
      pending: pending.map(mapShop),
      shops: allShops.map(mapShop),
      queue: await attachItems(queue),
    };
  });

export const reviewShop = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ shopId: z.number(), status: z.enum(["approved", "rejected"]) }))
  .handler(async ({ context, data }) => {
    const profile = await requireProfile(context.userId);
    if (profile.role !== "admin") throw new Error("That account is not an admin.");
    const sql = await getSql();
    await sql`update shops set status = ${data.status} where id = ${data.shopId}`;
    return { ok: true as const };
  });
