/* The Candy Lady frontend.
 *
 * Static pages talk to the Flask API. Nothing secret lives here: the Stripe
 * publishable key and the platform fee come from the API's /config endpoint.
 */

const DEFAULT_API_BASE_URL = "https://api.neighborhoodcandylady.com";
const LOCAL_API_BASE_URL = "http://127.0.0.1:5000";
const API_BASE_OVERRIDE_KEY = "candyLadyApiBase";

// Vercel serves these files without a build step, so there is no place to
// inject an env var. The base URL can still be pointed at a local API with
// ?api=http://127.0.0.1:5000 (remembered afterwards) or by setting
// window.CANDY_LADY_API_BASE_URL before this script runs.
const resolveApiBaseUrl = () => {
  const trim = (value) => String(value).replace(/\/+$/, "");
  const fromQuery = new URLSearchParams(window.location.search).get("api");
  if (fromQuery) {
    localStorage.setItem(API_BASE_OVERRIDE_KEY, trim(fromQuery));
  }
  const override =
    window.CANDY_LADY_API_BASE_URL || localStorage.getItem(API_BASE_OVERRIDE_KEY);
  if (override) return trim(override);
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") return LOCAL_API_BASE_URL;
  return DEFAULT_API_BASE_URL;
};

const API_BASE_URL = resolveApiBaseUrl();

const categoryTone = {
  candy: "strawberry",
  chips: "aqua",
  drinks: "citrus",
};

const revealItems = document.querySelectorAll(
  ".section-block, .value-strip > div, .phone-frame, .reveal"
);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  { threshold: 0.18 }
);

revealItems.forEach((item) => {
  item.classList.add("reveal");
  observer.observe(item);
});

const storage = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  },
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatCents = (cents) => money.format((Number(cents) || 0) / 100);

const escapeHtml = (value) => {
  const holder = document.createElement("div");
  holder.textContent = String(value ?? "");
  return holder.innerHTML;
};

const titleCase = (value) =>
  String(value || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

/* ------------------------------------------------------------------ */
/* Session                                                            */
/* ------------------------------------------------------------------ */

const session = {
  tokenKey: "candyLadyToken",
  userKey: "candyLadyUser",
  getToken() {
    return localStorage.getItem(this.tokenKey);
  },
  getUser() {
    return storage.get(this.userKey, null);
  },
  save({ access_token: accessToken, user }) {
    if (accessToken) localStorage.setItem(this.tokenKey, accessToken);
    if (user) storage.set(this.userKey, user);
  },
  setUser(user) {
    storage.set(this.userKey, user);
  },
  clear() {
    localStorage.removeItem(this.tokenKey);
    storage.remove(this.userKey);
  },
  isLoggedIn() {
    return Boolean(this.getToken());
  },
};

const api = async (path, { method = "GET", body, auth = false } = {}) => {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = session.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the Candy Lady API. Check your connection.");
  }

  if (response.status === 401) {
    session.clear();
    window.dispatchEvent(new CustomEvent("candy-auth-required"));
  }
  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(
      payload?.error || payload?.msg || `Request failed (${response.status})`
    );
    error.status = response.status;
    throw error;
  }
  return payload;
};

/* ------------------------------------------------------------------ */
/* Login gate for the seller and admin dashboards                     */
/* ------------------------------------------------------------------ */

const initDashboardGate = (root, { roles, wrongRoleMessage, onReady }) => {
  const loginPanel = root.querySelector("[data-login-panel]");
  const dashboard = root.querySelector("[data-dashboard-main]");
  const loginForm = root.querySelector("[data-login-form]");
  const loginMessage = root.querySelector("[data-login-message]");
  const logoutButton = root.querySelector("[data-logout]");

  const showLogin = (message = "") => {
    loginPanel.hidden = false;
    dashboard.hidden = true;
    if (logoutButton) logoutButton.hidden = true;
    if (loginMessage) loginMessage.textContent = message;
  };

  const openDashboard = async () => {
    try {
      const me = await api("/me", { auth: true });
      if (!roles.includes(me.user.role)) {
        session.clear();
        showLogin(wrongRoleMessage);
        return;
      }
      session.setUser(me.user);
      loginPanel.hidden = true;
      dashboard.hidden = false;
      if (logoutButton) logoutButton.hidden = false;
      if (loginMessage) loginMessage.textContent = "";
      onReady(me);
    } catch (error) {
      session.clear();
      showLogin(error.message || "Log in to continue.");
    }
  };

  window.addEventListener("candy-auth-required", () => {
    showLogin("Your session expired. Log in again to continue.");
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    if (loginMessage) loginMessage.textContent = "Signing in…";
    try {
      const result = await api("/login", {
        method: "POST",
        body: {
          email: String(formData.get("email") || "").trim(),
          password: formData.get("password"),
        },
      });
      session.save(result);
      loginForm.reset();
      await openDashboard();
    } catch (error) {
      showLogin(error.message || "Could not sign in.");
    }
  });

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      session.clear();
      showLogin("Signed out.");
    });
  }

  if (session.isLoggedIn()) {
    openDashboard();
  } else {
    showLogin();
  }
};

/* ------------------------------------------------------------------ */
/* Seller application                                                 */
/* ------------------------------------------------------------------ */

const applicationApp = document.querySelector("[data-application-app]");

if (applicationApp) {
  const form = applicationApp.querySelector("[data-application-form]");
  const message = applicationApp.querySelector("[data-application-message]");
  const preview = applicationApp.querySelector("[data-application-preview]");

  const renderPreview = (seller, login) => {
    preview.innerHTML = `
      <div><span>Status</span><strong>${escapeHtml(titleCase(seller.status))}</strong></div>
      <div><span>Shop</span><strong>${escapeHtml(seller.shop_name)}</strong></div>
      <div><span>Neighborhood</span><strong>${escapeHtml(seller.neighborhood)}</strong></div>
      <div><span>Pickup window</span><strong>${escapeHtml(seller.pickup_window)}</strong></div>
      <div><span>Your login</span><strong>${escapeHtml(login.email)}</strong></div>
    `;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const password = formData.get("password");
    if (password !== formData.get("passwordConfirm")) {
      message.textContent = "The two passwords do not match.";
      return;
    }

    message.textContent = "Submitting application…";
    try {
      const result = await api("/applications", {
        method: "POST",
        body: {
          shop_name: String(formData.get("shopName") || "").trim(),
          contact_name: String(formData.get("contactName") || "").trim(),
          neighborhood: String(formData.get("neighborhood") || "").trim(),
          pickup_window: String(formData.get("pickupWindow") || "").trim(),
          email: String(formData.get("email") || "").trim(),
          password,
        },
      });
      renderPreview(result.seller, result.login);
      form.reset();
      message.textContent = result.message;
    } catch (error) {
      message.textContent = error.message || "Could not submit the application.";
    }
  });
}

/* ------------------------------------------------------------------ */
/* Buyer shop                                                         */
/* ------------------------------------------------------------------ */

const buyerApp = document.querySelector("[data-buyer-app]");

if (buyerApp) {
  const searchInput = buyerApp.querySelector("[data-search-input]");
  const filterButtons = [...buyerApp.querySelectorAll("[data-filter]")];
  const productList = buyerApp.querySelector("[data-product-list]");
  const emptyState = buyerApp.querySelector("[data-empty-state]");
  const cartLines = buyerApp.querySelector("[data-cart-lines]");
  const cartTotal = buyerApp.querySelector("[data-cart-total]");
  const cartPaymentNote = buyerApp.querySelector("[data-payment-note]");
  const pickupFrom = buyerApp.querySelector("[data-pickup-from]");
  const orderMessage = buyerApp.querySelector("[data-order-message]");
  const placeOrderButton = buyerApp.querySelector("[data-place-order]");
  const sellerCards = buyerApp.querySelector("[data-seller-cards]");
  const shelfHeading = buyerApp.querySelector("[data-shelf-heading]");
  const paymentBanner = buyerApp.querySelector("[data-payment-banner]");
  const orderHistory = buyerApp.querySelector("[data-order-history]");
  const accountPanel = buyerApp.querySelector("[data-account-panel]");
  const signedOutView = buyerApp.querySelector("[data-signed-out]");
  const signedInView = buyerApp.querySelector("[data-signed-in]");
  const accountName = buyerApp.querySelector("[data-account-name]");
  const accountEmail = buyerApp.querySelector("[data-account-email]");
  const accountMessage = buyerApp.querySelector("[data-account-message]");
  const buyerLoginForm = buyerApp.querySelector("[data-buyer-login-form]");
  const buyerSignupForm = buyerApp.querySelector("[data-buyer-signup-form]");
  const buyerLogoutButton = buyerApp.querySelector("[data-buyer-logout]");
  const authTabs = [...buyerApp.querySelectorAll("[data-auth-tab]")];

  const CART_KEY = "candyLadyCart";
  const SELLER_KEY = "candyLadySellerId";

  let activeFilter = "all";
  let sellers = [];
  let activeSeller = null;
  let shelfItems = [];
  let cart = new Map();
  let platformConfig = null;

  const loadCart = () => {
    const saved = storage.get(CART_KEY, null);
    const savedSellerId = storage.get(SELLER_KEY, null);
    if (!saved || !Array.isArray(saved) || !savedSellerId) return new Map();
    return new Map(saved.map((item) => [String(item.id), item]));
  };

  const saveCart = () => {
    storage.set(CART_KEY, [...cart.values()]);
    storage.set(SELLER_KEY, activeSeller ? activeSeller.id : null);
  };

  /* ---------------- account ---------------- */

  const renderAccount = () => {
    const user = session.getUser();
    const signedIn = session.isLoggedIn() && user;
    signedOutView.hidden = Boolean(signedIn);
    signedInView.hidden = !signedIn;
    if (signedIn) {
      accountName.textContent = user.name;
      accountEmail.textContent = user.email;
    }
    updatePlaceOrderButton();
  };

  const refreshAccount = async () => {
    if (!session.isLoggedIn()) {
      renderAccount();
      return;
    }
    try {
      const me = await api("/me", { auth: true });
      session.setUser(me.user);
    } catch {
      session.clear();
    }
    renderAccount();
    renderOrderHistory();
  };

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      authTabs.forEach((item) => item.classList.toggle("active", item === tab));
      buyerLoginForm.hidden = tab.dataset.authTab !== "login";
      buyerSignupForm.hidden = tab.dataset.authTab !== "signup";
      accountMessage.textContent = "";
    });
  });

  buyerLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(buyerLoginForm);
    accountMessage.textContent = "Signing in…";
    try {
      const result = await api("/login", {
        method: "POST",
        body: {
          email: String(formData.get("email") || "").trim(),
          password: formData.get("password"),
        },
      });
      session.save(result);
      buyerLoginForm.reset();
      accountMessage.textContent = "";
      renderAccount();
      renderOrderHistory();
    } catch (error) {
      accountMessage.textContent = error.message || "Could not sign in.";
    }
  });

  buyerSignupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(buyerSignupForm);
    accountMessage.textContent = "Creating your account…";
    try {
      const result = await api("/signup", {
        method: "POST",
        body: {
          name: String(formData.get("name") || "").trim(),
          email: String(formData.get("email") || "").trim(),
          password: formData.get("password"),
        },
      });
      session.save(result);
      buyerSignupForm.reset();
      accountMessage.textContent = "";
      renderAccount();
      renderOrderHistory();
    } catch (error) {
      accountMessage.textContent = error.message || "Could not create the account.";
    }
  });

  buyerLogoutButton.addEventListener("click", () => {
    session.clear();
    accountMessage.textContent = "Signed out.";
    renderAccount();
    renderOrderHistory();
  });

  window.addEventListener("candy-auth-required", () => {
    renderAccount();
    accountMessage.textContent = "Your session expired. Sign in again to pay.";
  });

  /* ---------------- shops ---------------- */

  const renderSellerCards = () => {
    if (!sellers.length) {
      sellerCards.innerHTML =
        '<p class="empty-state">No approved shops are open yet. Check back soon.</p>';
      return;
    }

    sellerCards.innerHTML = sellers
      .map((seller) => {
        const selected = activeSeller && activeSeller.id === seller.id;
        return `
          <article
            class="seller-card feature-card${selected ? " selected" : ""}"
            data-seller-option="${seller.id}"
          >
            <div class="seller-card-top">
              <div>
                <p class="card-label">${seller.in_stock_count ? "Open now" : "Restocking"}</p>
                <h3>${escapeHtml(seller.shop_name)}</h3>
              </div>
              ${selected ? '<span class="status-pill approved">Shopping</span>' : ""}
            </div>
            <p>${escapeHtml(seller.neighborhood)} | ${escapeHtml(seller.pickup_window)}</p>
            <div class="badge-row">
              <span>Approved shop</span>
              <span>${seller.in_stock_count} in stock</span>
              <span>Pay by card</span>
            </div>
            <button class="mini-action" type="button" data-choose-seller="${seller.id}">
              ${selected ? "Shopping here" : "Shop this spot"}
            </button>
          </article>
        `;
      })
      .join("");
  };

  const renderProductList = () => {
    if (!activeSeller) {
      productList.innerHTML =
        '<p class="empty-state">Pick a shop above to see what is in stock.</p>';
      return;
    }
    productList.innerHTML = shelfItems
      .map((item) => {
        const candy = item.candy;
        const category = candy.category || "candy";
        const tone = categoryTone[category] || "strawberry";
        return `
          <article
            class="catalog-row ${tone}"
            data-product-card
            data-category="${escapeHtml(category)}"
            data-name="${escapeHtml(candy.name)}"
            data-price-cents="${candy.price_cents}"
            data-candy-id="${candy.id}"
          >
            <div>
              <p class="card-label">${escapeHtml(category)}</p>
              <h3>${escapeHtml(candy.name)}</h3>
              <p>${escapeHtml(candy.description || activeSeller.shop_name)} · ${
                item.inventory_count
              } left</p>
            </div>
            <div class="catalog-actions">
              <strong>${formatCents(candy.price_cents)}</strong>
              <button class="mini-action" type="button" data-add-to-cart>Add</button>
            </div>
          </article>
        `;
      })
      .join("");
  };

  const filterProducts = () => {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    productList.querySelectorAll("[data-product-card]").forEach((card) => {
      const matchesSearch = !query || card.dataset.name.toLowerCase().includes(query);
      const matchesFilter = activeFilter === "all" || card.dataset.category === activeFilter;
      const visible = matchesSearch && matchesFilter;
      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    if (!activeSeller) {
      emptyState.hidden = true;
      return;
    }
    emptyState.hidden = visibleCount !== 0;
    emptyState.textContent = shelfItems.length
      ? "No matching snacks found."
      : "This shop has nothing in stock right now.";
  };

  const loadSellers = async () => {
    try {
      sellers = await api("/sellers");
    } catch (error) {
      sellerCards.innerHTML = `<p class="empty-state">${escapeHtml(
        error.message || "Could not load shops."
      )}</p>`;
      return;
    }

    const savedSellerId = storage.get(SELLER_KEY, null);
    const preferred =
      sellers.find((seller) => seller.id === savedSellerId) || sellers[0] || null;
    renderSellerCards();
    if (preferred) {
      await selectSeller(preferred.id, { keepCart: true });
    } else {
      renderProductList();
      filterProducts();
    }
  };

  const selectSeller = async (sellerId, { keepCart = false } = {}) => {
    const previousId = activeSeller ? activeSeller.id : null;
    if (!keepCart && previousId !== sellerId && cart.size) {
      cart.clear();
      orderMessage.textContent = "Cart cleared because you switched shops.";
    }
    try {
      const storefront = await api(`/sellers/${sellerId}/storefront`);
      activeSeller = storefront.seller;
      shelfItems = storefront.items || [];
    } catch (error) {
      orderMessage.textContent = error.message || "Could not load that shop.";
      return;
    }

    // Drop anything that went out of stock while the cart was sitting there.
    const available = new Set(shelfItems.map((item) => String(item.candy.id)));
    [...cart.keys()].forEach((id) => {
      if (!available.has(id)) cart.delete(id);
    });

    if (shelfHeading) {
      shelfHeading.textContent = `In stock at ${activeSeller.shop_name}`;
    }
    if (pickupFrom) pickupFrom.textContent = activeSeller.shop_name;
    renderSellerCards();
    renderProductList();
    filterProducts();
    renderCart();
  };

  /* ---------------- cart ---------------- */

  const cartTotalCents = () =>
    [...cart.values()].reduce((sum, item) => sum + item.priceCents * item.qty, 0);

  const updatePlaceOrderButton = () => {
    const ready = Boolean(activeSeller) && cart.size > 0 && session.isLoggedIn();
    placeOrderButton.disabled = !ready;
    placeOrderButton.classList.toggle("disabled-action", !ready);
    if (!session.isLoggedIn() && cart.size) {
      placeOrderButton.textContent = "Sign in to pay";
    } else {
      placeOrderButton.textContent = `Pay ${formatCents(cartTotalCents())} & reserve`;
    }
  };

  const renderCart = () => {
    const items = [...cart.values()];
    saveCart();
    cartTotal.textContent = formatCents(cartTotalCents());
    updatePlaceOrderButton();

    if (!items.length) {
      cartLines.innerHTML = '<p class="empty-state">No snacks added yet.</p>';
      return;
    }

    cartLines.innerHTML = items
      .map(
        (item) => `
          <article class="cart-item" data-cart-item="${item.id}">
            <div class="cart-item-main">
              <strong>${escapeHtml(item.name)}</strong>
              <span>${formatCents(item.priceCents * item.qty)}</span>
            </div>
            <div class="cart-item-controls">
              <span>${formatCents(item.priceCents)} each</span>
              <div class="qty-controls" aria-label="${escapeHtml(item.name)} quantity">
                <button class="qty-button" type="button" data-cart-minus="${item.id}">-</button>
                <strong>${item.qty}</strong>
                <button class="qty-button" type="button" data-cart-plus="${item.id}">+</button>
              </div>
            </div>
          </article>
        `
      )
      .join("");
  };

  productList.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-to-cart]");
    if (!addButton) return;
    const card = addButton.closest("[data-product-card]");
    const id = card.dataset.candyId;
    const shelfItem = shelfItems.find((item) => String(item.candy.id) === id);
    const existing = cart.get(id);
    const nextQty = (existing ? existing.qty : 0) + 1;

    if (shelfItem && nextQty > shelfItem.inventory_count) {
      orderMessage.textContent = `Only ${shelfItem.inventory_count} left of ${shelfItem.candy.name}.`;
      return;
    }

    cart.set(id, {
      id,
      name: card.dataset.name,
      priceCents: Number(card.dataset.priceCents),
      qty: nextQty,
    });
    orderMessage.textContent = `${card.dataset.name} added to your pickup order.`;
    renderCart();
  });

  cartLines.addEventListener("click", (event) => {
    const plusButton = event.target.closest("[data-cart-plus]");
    const minusButton = event.target.closest("[data-cart-minus]");

    if (plusButton) {
      const id = plusButton.dataset.cartPlus;
      const item = cart.get(id);
      const shelfItem = shelfItems.find((row) => String(row.candy.id) === id);
      if (shelfItem && item.qty + 1 > shelfItem.inventory_count) {
        orderMessage.textContent = `Only ${shelfItem.inventory_count} left of ${item.name}.`;
        return;
      }
      cart.set(id, { ...item, qty: item.qty + 1 });
      renderCart();
    }

    if (minusButton) {
      const id = minusButton.dataset.cartMinus;
      const item = cart.get(id);
      if (item.qty === 1) {
        cart.delete(id);
      } else {
        cart.set(id, { ...item, qty: item.qty - 1 });
      }
      renderCart();
    }
  });

  sellerCards.addEventListener("click", (event) => {
    const button = event.target.closest("[data-choose-seller]");
    if (!button) return;
    selectSeller(Number(button.dataset.chooseSeller));
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      filterProducts();
    });
  });

  searchInput.addEventListener("input", filterProducts);

  /* ---------------- checkout ---------------- */

  placeOrderButton.addEventListener("click", async () => {
    if (!session.isLoggedIn()) {
      orderMessage.textContent = "Sign in or create an account to pay for your order.";
      accountPanel.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!activeSeller || !cart.size) {
      orderMessage.textContent = "Pick a shop and add at least one snack.";
      return;
    }

    placeOrderButton.disabled = true;
    orderMessage.textContent = "Starting secure checkout…";
    try {
      const order = await api("/orders", {
        method: "POST",
        auth: true,
        body: {
          seller_id: activeSeller.id,
          items: [...cart.values()].map((item) => ({
            candy_id: Number(item.id),
            quantity: item.qty,
          })),
        },
      });
      cart.clear();
      saveCart();
      window.location.assign(order.checkout_url);
    } catch (error) {
      orderMessage.textContent = error.message || "Could not start checkout.";
      updatePlaceOrderButton();
    }
  });

  const showBanner = (tone, html) => {
    paymentBanner.hidden = false;
    paymentBanner.className = `app-panel payment-banner ${tone}`;
    paymentBanner.innerHTML = html;
  };

  const clearReturnParams = () => {
    const url = new URL(window.location.href);
    ["order", "session_id", "payment"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  };

  const renderPaidBanner = (order) => {
    showBanner(
      "paid",
      `
        <p class="card-label">Payment received</p>
        <h2>Pickup code ${escapeHtml(order.pickup_code)}</h2>
        <p>
          Order #${order.id} · ${formatCents(order.total_cents)} paid by card.
          Show this code at ${escapeHtml(order.seller ? order.seller.shop_name : "the shop")}.
        </p>
      `
    );
  };

  const handlePaymentReturn = async () => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("order");
    if (!orderId) return;

    if (params.get("payment") === "cancelled") {
      showBanner(
        "cancelled",
        `
          <p class="card-label">Payment cancelled</p>
          <h2>Order #${escapeHtml(orderId)} is not paid</h2>
          <p>Nothing was charged. You can finish paying or release the items.</p>
          <div class="row-actions">
            <button class="mini-action" type="button" data-resume-payment="${escapeHtml(
              orderId
            )}">Finish paying</button>
            <button class="soft-action" type="button" data-cancel-order="${escapeHtml(
              orderId
            )}">Release items</button>
          </div>
        `
      );
      clearReturnParams();
      return;
    }

    if (!params.get("session_id") || !session.isLoggedIn()) return;

    showBanner("pending", "<p class='card-label'>Confirming your payment…</p>");
    clearReturnParams();
    try {
      const order = await api(`/orders/${orderId}/payment/confirm`, {
        method: "POST",
        auth: true,
      });
      if (order.payment_status === "paid") {
        renderPaidBanner(order);
      } else {
        showBanner(
          "cancelled",
          `<p class="card-label">Not paid yet</p>
           <h2>Order #${order.id} is ${escapeHtml(titleCase(order.payment_status))}</h2>
           <p>Stripe has not confirmed a payment for this order.</p>`
        );
      }
      renderOrderHistory();
      if (activeSeller) selectSeller(activeSeller.id, { keepCart: true });
    } catch (error) {
      showBanner(
        "cancelled",
        `<p class="card-label">Could not confirm</p><p>${escapeHtml(error.message)}</p>`
      );
    }
  };

  paymentBanner.addEventListener("click", async (event) => {
    const resumeButton = event.target.closest("[data-resume-payment]");
    const cancelButton = event.target.closest("[data-cancel-order]");
    try {
      if (resumeButton) {
        const order = await api(`/orders/${resumeButton.dataset.resumePayment}/checkout`, {
          method: "POST",
          auth: true,
        });
        if (order.checkout_url) {
          window.location.assign(order.checkout_url);
          return;
        }
        if (order.payment_status === "paid") renderPaidBanner(order);
      }
      if (cancelButton) {
        await api(`/orders/${cancelButton.dataset.cancelOrder}/cancel`, {
          method: "POST",
          auth: true,
        });
        paymentBanner.hidden = true;
        renderOrderHistory();
        if (activeSeller) selectSeller(activeSeller.id, { keepCart: true });
      }
    } catch (error) {
      showBanner("cancelled", `<p>${escapeHtml(error.message)}</p>`);
    }
  });

  /* ---------------- order history ---------------- */

  const paymentTone = {
    paid: "approved",
    pay_at_pickup: "approved",
    pending: "waiting",
    unpaid: "waiting",
    expired: "rejected",
    refunded: "rejected",
  };

  const renderOrderHistory = async () => {
    if (!session.isLoggedIn()) {
      orderHistory.innerHTML =
        '<p class="empty-state">Sign in to see your pickup codes and past orders.</p>';
      return;
    }
    let orders = [];
    try {
      orders = await api("/me/orders", { auth: true });
    } catch (error) {
      orderHistory.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
      return;
    }
    if (!orders.length) {
      orderHistory.innerHTML = '<p class="empty-state">No orders yet.</p>';
      return;
    }

    orderHistory.innerHTML = orders
      .map((order) => {
        const tone = paymentTone[order.payment_status] || "waiting";
        const lines = order.items
          .map((item) => `${item.quantity} × ${escapeHtml(item.candy.name)}`)
          .join(", ");
        const code = order.pickup_code
          ? `Pickup code <strong>${escapeHtml(order.pickup_code)}</strong>`
          : "Pickup code appears once payment clears";
        return `
          <article class="order-row">
            <div>
              <strong>Order #${order.id} · ${escapeHtml(
                order.seller ? order.seller.shop_name : "Shop"
              )}</strong>
              <p>${lines}</p>
              <p>${code}</p>
            </div>
            <div class="row-actions">
              <span class="status-pill ${tone}">${escapeHtml(
                titleCase(order.payment_status)
              )}</span>
              <span class="status-pill">${escapeHtml(titleCase(order.status))}</span>
              <strong>${formatCents(order.total_cents)}</strong>
              ${
                order.payment_status === "pending"
                  ? `<button class="mini-action" type="button" data-resume-payment="${order.id}">Finish paying</button>`
                  : ""
              }
            </div>
          </article>
        `;
      })
      .join("");
  };

  orderHistory.addEventListener("click", async (event) => {
    const resumeButton = event.target.closest("[data-resume-payment]");
    if (!resumeButton) return;
    try {
      const order = await api(`/orders/${resumeButton.dataset.resumePayment}/checkout`, {
        method: "POST",
        auth: true,
      });
      if (order.checkout_url) window.location.assign(order.checkout_url);
    } catch (error) {
      orderMessage.textContent = error.message;
    }
  });

  /* ---------------- boot ---------------- */

  const loadPlatformConfig = async () => {
    try {
      platformConfig = await api("/config");
    } catch {
      platformConfig = null;
    }
    if (!cartPaymentNote) return;
    if (!platformConfig || !platformConfig.stripe_enabled) {
      cartPaymentNote.textContent = "Card payments are offline right now";
      return;
    }
    cartPaymentNote.textContent =
      platformConfig.stripe_mode === "test"
        ? "Card via Stripe (test mode)"
        : "Card via Stripe";
  };

  cart = loadCart();
  renderAccount();
  renderCart();
  loadPlatformConfig();
  refreshAccount();
  loadSellers().then(handlePaymentReturn);
  renderOrderHistory();
}

/* ------------------------------------------------------------------ */
/* Seller dashboard                                                   */
/* ------------------------------------------------------------------ */

const sellerApp = document.querySelector("[data-seller-app]");

if (sellerApp) {
  const inStockCount = sellerApp.querySelector("[data-in-stock-count]");
  const activeOrderCount = sellerApp.querySelector("[data-seller-order-count]");
  const payoutTotal = sellerApp.querySelector("[data-seller-payout-total]");
  const inventoryGrid = sellerApp.querySelector(".inventory-grid");
  const orderList = sellerApp.querySelector(".order-list");
  const shopName = sellerApp.querySelector("[data-shop-name]");
  const shopNeighborhood = sellerApp.querySelector("[data-shop-neighborhood]");
  const shopHours = sellerApp.querySelector("[data-shop-hours]");
  const shopStatus = sellerApp.querySelector("[data-shop-status]");
  const shopNotice = sellerApp.querySelector("[data-shop-notice]");
  const feeNote = sellerApp.querySelector("[data-fee-note]");

  let sellerId = null;

  const orderButtons = { new: "Start packing", packing: "Mark ready", ready: "Complete" };
  const orderClasses = { new: "waiting", packing: "prepping", ready: "ready" };
  const nextStatus = { new: "packing", packing: "ready", ready: "completed" };

  const renderShopProfile = (seller) => {
    if (!seller) return;
    shopName.textContent = seller.shop_name;
    shopNeighborhood.textContent = seller.neighborhood;
    shopHours.textContent = seller.pickup_window;
    shopStatus.textContent = titleCase(seller.status);
    if (seller.status === "approved") {
      shopNotice.hidden = true;
    } else {
      shopNotice.hidden = false;
      shopNotice.textContent =
        seller.status === "pending"
          ? "Your shop is waiting for admin approval. Buyers cannot see it yet, but you can set your stock now."
          : "This shop was rejected. Contact the platform admin.";
    }
  };

  const renderInventory = (inventory) => {
    inventoryGrid.innerHTML =
      inventory
        .map((item) => {
          const category = item.candy?.category || "candy";
          const tone = categoryTone[category] || "strawberry";
          return `
            <article
              class="inventory-card ${tone}"
              data-inventory-card
              data-candy-id="${item.candy_id}"
              data-stock-status="${item.status}"
              data-inventory-count="${item.inventory_count}"
            >
              <div>
                <p class="card-label">${escapeHtml(category)}</p>
                <h3>${escapeHtml(item.candy.name)}</h3>
              </div>
              <div class="inventory-meta">
                <span>${formatCents(item.candy.price_cents)} · ${
                  item.inventory_count
                } left</span>
                <strong data-stock-label>${titleCase(item.status)}</strong>
                <button class="mini-action" type="button" data-toggle-stock>${
                  item.status === "out-of-stock" ? "Mark in stock" : "Mark out"
                }</button>
              </div>
            </article>`;
        })
        .join("") || '<p class="empty-state">No catalog items yet.</p>';
    inStockCount.textContent = inventory.filter(
      (item) => item.status !== "out-of-stock"
    ).length;
  };

  const renderOrders = (orders) => {
    orderList.innerHTML =
      orders
        .map((order) => {
          const lines = order.items
            .map((item) => `${item.quantity} × ${escapeHtml(item.candy.name)}`)
            .join(", ");
          const paidLabel =
            order.payment_status === "paid" ? "Paid by card" : "Pay at pickup (legacy)";
          return `
            <article class="order-row" data-order-row data-order-id="${order.id}" data-order-status-value="${order.status}">
              <div>
                <strong>Order #${order.id} · ${escapeHtml(
                  order.pickup_code || "no code"
                )}</strong>
                <p>${lines}</p>
                <p>${escapeHtml(order.buyer_name || "Buyer")} · ${paidLabel} · you keep ${formatCents(
                  order.seller_payout_cents
                )} of ${formatCents(order.total_cents)}</p>
              </div>
              <div class="row-actions">
                <span class="status-pill ${orderClasses[order.status] || "waiting"}">${titleCase(
                  order.status
                )}</span>
                ${
                  nextStatus[order.status]
                    ? `<button class="mini-action" type="button" data-next-order-status>${
                        orderButtons[order.status]
                      }</button>`
                    : ""
                }
              </div>
            </article>`;
        })
        .join("") || '<p class="empty-state">No paid pickup orders waiting.</p>';
    activeOrderCount.textContent = orders.length;
    payoutTotal.textContent = formatCents(
      orders.reduce((sum, order) => sum + order.seller_payout_cents, 0)
    );
  };

  const loadSellerDashboard = async () => {
    try {
      const [inventory, orders] = await Promise.all([
        api(`/sellers/${sellerId}/inventory`, { auth: true }),
        api(`/sellers/${sellerId}/orders`, { auth: true }),
      ]);
      renderInventory(inventory);
      renderOrders(orders);
    } catch (error) {
      orderList.innerHTML = `<p class="empty-state">${escapeHtml(
        error.message || "Could not load seller data."
      )}</p>`;
    }
  };

  const loadFeeNote = async () => {
    if (!feeNote) return;
    try {
      const config = await api("/config");
      const parts = [];
      if (config.platform_fee_percent) parts.push(`${config.platform_fee_percent}%`);
      if (config.platform_fee_flat_cents) {
        parts.push(formatCents(config.platform_fee_flat_cents));
      }
      feeNote.textContent = parts.length
        ? `${parts.join(" + ")} platform fee`
        : "No platform fee";
    } catch {
      feeNote.textContent = "Platform fee unavailable";
    }
  };

  inventoryGrid.addEventListener("click", async (event) => {
    const stockButton = event.target.closest("[data-toggle-stock]");
    if (!stockButton) return;
    const card = stockButton.closest("[data-inventory-card]");
    const currentlyOut = card.dataset.stockStatus === "out-of-stock";
    const body = currentlyOut
      ? {
          status: "in-stock",
          inventory_count: Math.max(8, Number(card.dataset.inventoryCount) || 0),
        }
      : { status: "out-of-stock" };
    try {
      await api(`/sellers/${sellerId}/inventory/${card.dataset.candyId}`, {
        method: "PUT",
        auth: true,
        body,
      });
      loadSellerDashboard();
    } catch (error) {
      orderList.insertAdjacentHTML(
        "beforebegin",
        `<p class="order-message">${escapeHtml(error.message)}</p>`
      );
    }
  });

  orderList.addEventListener("click", async (event) => {
    const orderButton = event.target.closest("[data-next-order-status]");
    if (!orderButton) return;
    const row = orderButton.closest("[data-order-row]");
    const status = nextStatus[row.dataset.orderStatusValue];
    if (!status) return;
    try {
      await api(`/orders/${row.dataset.orderId}/status`, {
        method: "PUT",
        auth: true,
        body: { status },
      });
      loadSellerDashboard();
    } catch (error) {
      row.insertAdjacentHTML(
        "afterend",
        `<p class="order-message">${escapeHtml(error.message)}</p>`
      );
    }
  });

  initDashboardGate(sellerApp, {
    roles: ["seller", "admin"],
    wrongRoleMessage: "That account is not a seller. Use the shop or admin page instead.",
    onReady: (me) => {
      sellerId = me.user.seller_id;
      if (!sellerId) {
        orderList.innerHTML =
          '<p class="empty-state">This account is not linked to a shop. An admin can link it with manage.py set-role.</p>';
        inventoryGrid.innerHTML = "";
        renderShopProfile(null);
        return;
      }
      renderShopProfile(me.seller);
      loadFeeNote();
      loadSellerDashboard();
    },
  });
}

/* ------------------------------------------------------------------ */
/* Admin dashboard                                                    */
/* ------------------------------------------------------------------ */

const adminApp = document.querySelector("[data-admin-app]");

if (adminApp) {
  const activeSellerCount = adminApp.querySelector("[data-active-seller-count]");
  const pendingReviewCount = adminApp.querySelector("[data-pending-review-count]");
  const approvedItemCount = adminApp.querySelector("[data-approved-item-count]");
  const applicationList = adminApp.querySelector(".approval-list");
  const catalogGrid = adminApp.querySelector("[data-admin-catalog]");
  const candyCount = adminApp.querySelector("[data-count-candy]");
  const chipsCount = adminApp.querySelector("[data-count-chips]");
  const drinksCount = adminApp.querySelector("[data-count-drinks]");
  const revenueStack = adminApp.querySelector("[data-revenue-stack]");

  const approvalClasses = { pending: "waiting", approved: "approved", rejected: "rejected" };

  const renderCatalog = (candies) => {
    approvedItemCount.textContent = candies.length;
    const counts = { candy: 0, chips: 0, drinks: 0 };
    candies.forEach((candy) => {
      counts[candy.category || "candy"] += 1;
    });
    candyCount.textContent = `${counts.candy} items`;
    chipsCount.textContent = `${counts.chips} items`;
    drinksCount.textContent = `${counts.drinks} items`;
    catalogGrid.innerHTML = candies
      .map((candy) => {
        const category = candy.category || "candy";
        const tone = categoryTone[category] || "strawberry";
        return `
          <article class="catalog-admin-card ${tone}">
            <p class="card-label">${escapeHtml(category)}</p>
            <h3>${escapeHtml(candy.name)}</h3>
            <p>${escapeHtml(candy.description || "Approved catalog item")}</p>
            <strong>${formatCents(candy.price_cents)}</strong>
          </article>`;
      })
      .join("");
  };

  const renderApplications = (applications) => {
    pendingReviewCount.textContent = applications.length;
    if (!applications.length) {
      applicationList.innerHTML =
        '<p class="empty-state">No applications waiting for review.</p>';
      return;
    }

    applicationList.innerHTML = applications
      .map(
        (seller) => `
          <article class="approval-row" data-seller-id="${seller.id}">
            <div>
              <strong>${escapeHtml(seller.shop_name)}</strong>
              <p>${escapeHtml(seller.neighborhood)} | ${escapeHtml(seller.pickup_window)}</p>
              <p>Contact: ${escapeHtml(seller.contact_name)} · login ${escapeHtml(
                seller.contact_email || "not set"
              )}</p>
            </div>
            <div class="approval-actions">
              <span class="status-pill ${approvalClasses[seller.status]}">${titleCase(
                seller.status
              )}</span>
              <button class="mini-action" type="button" data-approve-seller>Approve</button>
              <button class="soft-action" type="button" data-reject-seller>Reject</button>
            </div>
          </article>`
      )
      .join("");
  };

  const renderRevenue = (revenue) => {
    if (!revenueStack) return;
    const feeLabel = [
      revenue.platform_fee_percent ? `${revenue.platform_fee_percent}%` : null,
      revenue.platform_fee_flat_cents
        ? formatCents(revenue.platform_fee_flat_cents)
        : null,
    ]
      .filter(Boolean)
      .join(" + ");
    revenueStack.innerHTML = `
      <div><span>Paid orders</span><strong>${revenue.paid_order_count}</strong></div>
      <div><span>Collected</span><strong>${formatCents(revenue.gross_cents)}</strong></div>
      <div><span>Platform fee earned</span><strong>${formatCents(
        revenue.platform_fee_cents
      )}</strong></div>
      <div><span>Owed to sellers</span><strong>${formatCents(
        revenue.seller_payout_cents
      )}</strong></div>
      <div><span>Fee rate</span><strong>${escapeHtml(feeLabel || "none")}</strong></div>
    `;
  };

  const loadAdminDashboard = async () => {
    try {
      const [pending, approved, candies, revenue] = await Promise.all([
        api("/applications?status=pending", { auth: true }),
        api("/applications?status=approved", { auth: true }),
        api("/candies"),
        api("/admin/revenue", { auth: true }),
      ]);
      activeSellerCount.textContent = approved.length;
      renderApplications(pending);
      renderCatalog(candies);
      renderRevenue(revenue);
    } catch (error) {
      applicationList.innerHTML = `<p class="empty-state">${escapeHtml(
        error.message || "Could not load applications."
      )}</p>`;
    }
  };

  applicationList.addEventListener("click", async (event) => {
    const approveButton = event.target.closest("[data-approve-seller]");
    const rejectButton = event.target.closest("[data-reject-seller]");
    if (!approveButton && !rejectButton) return;
    const row = event.target.closest("[data-seller-id]");
    if (!row) return;

    try {
      await api(`/applications/${row.dataset.sellerId}`, {
        method: "PUT",
        auth: true,
        body: { status: approveButton ? "approved" : "rejected" },
      });
      loadAdminDashboard();
    } catch (error) {
      row.insertAdjacentHTML(
        "afterend",
        `<p class="order-message">${escapeHtml(error.message)}</p>`
      );
    }
  });

  initDashboardGate(adminApp, {
    roles: ["admin"],
    wrongRoleMessage: "That account is not an admin.",
    onReady: loadAdminDashboard,
  });
}
