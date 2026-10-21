// Shapes the Flask API returns, written from the to_dict() methods in
// backend/models.py. Keep these in step with that file: Flask is the source of
// truth and nothing here is validated at runtime.

export type Role = "buyer" | "seller" | "admin";

export type IdentityStatus =
  | "unstarted"
  | "processing"
  | "requires_input"
  | "verified"
  | "canceled";

export type PhotoStatus = "pending" | "approved" | "rejected";

/** User.to_dict() */
export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  seller_id: number | null;
  has_password: boolean;
  photo_url: string | null;
  photo_status: PhotoStatus;
  identity_status: IdentityStatus;
  identity_verified: boolean;
};

/** Seller.theme_dict(): colours are #rrggbb, checked by storefront.py. */
export type SellerTheme = {
  primary: string | null;
  accent: string | null;
  on_primary: string | null;
  on_accent: string | null;
};

/** Seller.connect_dict(), owner and admin only. */
export type SellerConnect = {
  status: "unstarted" | "onboarding" | "restricted" | "active";
  account_id: string | null;
  charges_enabled: boolean;
  details_submitted: boolean;
  updated_at: string | null;
};

/** SellerPhoto.to_dict() */
export type SellerPhoto = {
  id: number;
  seller_id: number;
  candy_id: number | null;
  url: string | null;
  caption: string | null;
  status: PhotoStatus;
  created_at: string | null;
  rejection_reason: string | null;
};

/** Seller.to_dict(). The owner/admin fields only come with include_contact_email. */
export type Seller = {
  id: number;
  shop_name: string;
  contact_name: string;
  neighborhood: string;
  pickup_window: string;
  status: "pending" | "approved" | "rejected";
  profile_photo_url: string | null;
  identity_verified: boolean;
  slug: string | null;
  storefront_path: string | null;
  tagline: string | null;
  logo_url: string | null;
  theme: SellerTheme;
  accepts_card_payments: boolean;
  photos?: SellerPhoto[];
  contact_email?: string | null;
  profile_photo_status?: PhotoStatus;
  identity_status?: IdentityStatus;
  connect?: SellerConnect;
};

export type Category = "candy" | "chips" | "drinks";

/** Candy.to_dict() */
export type Candy = {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  owner_seller_id: number | null;
  is_active: boolean;
  category: Category;
};

export type StockStatus = "in-stock" | "low-stock" | "out-of-stock";

/** SellerInventory.to_dict() */
export type InventoryItem = {
  id: number;
  seller_id: number;
  candy_id: number;
  inventory_count: number;
  status: StockStatus;
  candy: Candy | null;
};

export type OrderStatus = "new" | "packing" | "ready" | "completed";

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "pay_at_pickup"
  | "expired"
  | "refunded";

/** OrderItem.to_dict() */
export type OrderItem = {
  id: number;
  candy_id: number;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
  candy: Candy | null;
};

/** Order.to_dict(), plus the seller and checkout_url that order_response() adds. */
export type Order = {
  id: number;
  user_id: number | null;
  seller_id: number;
  status: OrderStatus;
  total_cents: number;
  refunded_cents: number;
  platform_fee_refunded_cents: number;
  payment_status: PaymentStatus;
  platform_fee_cents: number;
  seller_payout_cents: number;
  currency: string;
  payout_method: "connect" | "manual";
  paid_at: string | null;
  created_at: string | null;
  items: OrderItem[];
  /** Only set once the order is paid; null before. */
  pickup_code: string | null;
  seller?: Seller | null;
  checkout_url?: string;
};

/** GET /me */
export type Me = {
  user: User;
  seller?: Seller | null;
};

/** Every Flask error body: {"error": "..."} */
export type ApiError = { error: string };

/** One row of GET /sellers/<id>/orders: an Order plus who is picking it up. */
export type SellerOrder = Order & { buyer_name: string };

/** GET /config: non-secret settings. Only the fields the site reads. */
export type PublicConfig = {
  platform_fee_percent?: number;
  platform_fee_flat_cents?: number;
  uploads_enabled: boolean;
  max_upload_bytes: number;
  identity_enabled: boolean;
};

/** identity_payload() in app.py; POST /identity/session adds the Stripe url. */
export type IdentityState = {
  identity_status: IdentityStatus;
  identity_verified: boolean;
  identity_error: string | null;
  identity_verified_at: string | null;
  url?: string | null;
};

/** connect_payload() in app.py; POST /sellers/<id>/stripe/connect adds the url. */
export type ConnectState = SellerConnect & { seller_id: number; url?: string | null };
