export type Role = "buyer" | "seller" | "admin";
export type ShopStatus = "pending" | "approved" | "rejected";
export type Category = "candy" | "chips" | "drinks";
export type OrderStatus = "new" | "packing" | "ready" | "completed";
export type IdentityStatus = "unstarted" | "processing" | "verified" | "canceled";
export type ConnectStatus = "unstarted" | "pending" | "complete";

export type Profile = {
  userId: string;
  name: string;
  email: string | null;
  role: Role;
  shopId: number | null;
  identityStatus: IdentityStatus;
};

export type ShopCard = {
  id: number;
  shopName: string;
  contactName: string;
  neighborhood: string;
  pickupWindow: string;
  status: ShopStatus;
  identityVerified: boolean;
  photoPath: string | null;
  inStockCount: number;
  stripeAccountId: string | null;
  connectStatus: ConnectStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
};

export type CatalogItem = {
  id: number;
  name: string;
  description: string;
  priceCents: number;
  category: Category;
  imagePath: string;
};

export type InventoryItem = CatalogItem & {
  inventoryCount: number;
  stock: ReturnType<typeof import("./money").stockLabel>;
};

export type CartLine = {
  shopId: number;
  shopName: string;
  catalogId: number;
  name: string;
  imagePath: string;
  priceCents: number;
  quantity: number;
  max: number;
};

export type OrderItemView = {
  id: number;
  catalogId: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type OrderView = {
  id: number;
  shopId: number;
  shopName: string;
  neighborhood: string;
  totalCents: number;
  platformFeeCents: number;
  stripeFeeCents: number;
  sellerPayoutCents: number;
  status: OrderStatus;
  paymentStatus: string;
  pickupCode: string | null;
  buyerName: string;
  createdAt: string;
  chargeModel: string;
  paymentIntentId: string | null;
  items: OrderItemView[];
};

export type SellerLedger = {
  paidOrders: number;
  gmvCents: number;
  applicationFeeCents: number;
  stripeFeeCents: number;
  netCents: number;
  pendingPayoutCents: number;
};

export type AdminStats = {
  paidOrders: number;
  collectedCents: number;
  feeEarnedCents: number;
  paidToSellersCents: number;
  pendingShops: number;
  connectedShops: number;
};
