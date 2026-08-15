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

document.querySelectorAll("[data-reset-demo]").forEach((button) => {
  button.addEventListener("click", () => {
    [
      "candyLadyCart",
      "candyLadySellerState",
      "candyLadyAdminState",
      "candyLadyLastPickupCode",
      "candyLadyApplications",
    ].forEach((key) => storage.remove(key));

    window.location.reload();
  });
});

const buyerApp = document.querySelector("[data-buyer-app]");

const API_BASE_URL = "http://127.0.0.1:5000";
const applicationApp = document.querySelector("[data-application-app]");

if (applicationApp) {
  const form = document.querySelector("[data-application-form]");
  const message = document.querySelector("[data-application-message]");
  const preview = document.querySelector("[data-application-preview]");

  const renderApplicationPreview = (seller) => {
    preview.innerHTML = `
      <div><span>Status</span><strong>${seller.status}</strong></div>
      <div><span>Shop</span><strong>${seller.shop_name}</strong></div>
      <div><span>Neighborhood</span><strong>${seller.neighborhood}</strong></div>
      <div><span>Pickup window</span><strong>${seller.pickup_window}</strong></div>
    `;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    message.textContent = "Submitting application…";

    try {
      const response = await fetch(`${API_BASE_URL}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_name: formData.get("shopName").trim(),
          contact_name: formData.get("contactName").trim(),
          neighborhood: formData.get("neighborhood").trim(),
          pickup_window: formData.get("pickupWindow").trim(),
        }),
      });
      if (!response.ok) throw new Error("Unable to submit application");

      const seller = await response.json();
      renderApplicationPreview(seller);
      form.reset();
      message.textContent = "Application submitted for admin review.";
    } catch (error) {
      console.error(error);
      message.textContent = "Could not submit application. Is the backend running?";
    }
  });
}

if (buyerApp) {
  const searchInput = document.querySelector("[data-search-input]");
  const filterButtons = [...document.querySelectorAll("[data-filter]")];
  const productList = document.querySelector("[data-product-list]");
  const emptyState = document.querySelector("[data-empty-state]");
  const cartLines = document.querySelector("[data-cart-lines]");
  const cartTotal = document.querySelector("[data-cart-total]");
  const pickupCode = document.querySelector("[data-pickup-code]");
  const orderMessage = document.querySelector("[data-order-message]");
  const placeOrderButton = document.querySelector("[data-place-order]");
  const cart = new Map(
    storage.get("candyLadyCart", []).map((item) => [item.id, item])
  );
  let activeFilter = "all";
  let candies = [];

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const fetchCandies = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/candies`);
      if (!response.ok) throw new Error("Failed to fetch candies");
      candies = await response.json();
      renderProductList();
      filterProducts();
    } catch (error) {
      console.error("Error fetching candies:", error);
      orderMessage.textContent = "Failed to load candies. Check backend server.";
    }
  };

  const renderProductList = () => {
    productList.innerHTML = candies
      .map(
        (candy) => `
          <article
            class="catalog-row strawberry"
            data-product-card
            data-category="candy"
            data-open="true"
            data-name="${candy.name}"
            data-price="${(candy.price_cents / 100).toFixed(2)}"
            data-candy-id="${candy.id}"
          >
            <div>
              <p class="card-label">Available</p>
              <h3>${candy.name}</h3>
              <p>${candy.description || 'Stocked item'}</p>
            </div>
            <div class="catalog-actions">
              <strong>${money.format(candy.price_cents / 100)}</strong>
              <button class="mini-action" type="button" data-add-to-cart>Add</button>
            </div>
          </article>
        `
      )
      .join("");
  };

  const renderCart = () => {
    const items = [...cart.values()];
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);

    storage.set("candyLadyCart", items);
    cartTotal.textContent = money.format(total);

    if (!items.length) {
      cartLines.innerHTML = '<p class="empty-state">No snacks added yet.</p>';
      return;
    }

    cartLines.innerHTML = items
      .map(
        (item) => `
          <article class="cart-item" data-cart-item="${item.id}">
            <div class="cart-item-main">
              <strong>${item.name}</strong>
              <span>${money.format(item.price * item.qty)}</span>
            </div>
            <div class="cart-item-controls">
              <span>${money.format(item.price)} each</span>
              <div class="qty-controls" aria-label="${item.name} quantity">
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

  const renderPickupCode = () => {
    const savedCode = storage.get("candyLadyLastPickupCode", null);
    pickupCode.textContent = savedCode || "Not placed yet";
  };

  const filterProducts = () => {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    document.querySelectorAll("[data-product-card]").forEach((card) => {
      const name = card.dataset.name.toLowerCase();
      const category = card.dataset.category;
      const isOpen = card.dataset.open === "true";
      const matchesSearch = !query || name.includes(query);
      const matchesFilter =
        activeFilter === "all" ||
        category === activeFilter ||
        (activeFilter === "open" && isOpen);
      const visible = matchesSearch && matchesFilter;

      card.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    emptyState.hidden = visibleCount !== 0;
  };

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      filterButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      filterProducts();
    });
  });

  searchInput.addEventListener("input", filterProducts);

  document.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-to-cart]");
    const plusButton = event.target.closest("[data-cart-plus]");
    const minusButton = event.target.closest("[data-cart-minus]");

    if (addButton) {
      const card = addButton.closest("[data-product-card]");
      const id = card.dataset.candyId;
      const name = card.dataset.name;
      const price = Number(card.dataset.price);
      const existing = cart.get(id);

      cart.set(id, {
        id,
        name,
        price,
        qty: existing ? existing.qty + 1 : 1,
      });
      orderMessage.textContent = `${name} added to pickup order.`;
      renderCart();
    }

    if (plusButton) {
      const id = plusButton.dataset.cartPlus;
      const item = cart.get(id);
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

  placeOrderButton.addEventListener("click", async () => {
    if (!cart.size) {
      orderMessage.textContent = "Add at least one snack before placing an order.";
      return;
    }

    const items = [...cart.values()].map((item) => ({
      candy_id: parseInt(item.id),
      quantity: item.qty,
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: 1, seller_id: 1, items }),
      });
      if (!response.ok) throw new Error("Failed to place order");
      const order = await response.json();
      const code = `CL-${order.id}`;

      storage.set("candyLadyLastPickupCode", code);
      pickupCode.textContent = code;
      orderMessage.textContent = `Pickup order placed. Show code ${code} at pickup.`;
      cart.clear();
      renderCart();
    } catch (error) {
      console.error("Error placing order:", error);
      orderMessage.textContent = "Failed to place order. Try again.";
    }
  });

  fetchCandies();
  renderCart();
  renderPickupCode();
}

const sellerApp = document.querySelector("[data-seller-app]");

if (sellerApp) {
  const inStockCount = document.querySelector("[data-in-stock-count]");
  const activeOrderCount = document.querySelector("[data-seller-order-count]");
  const inventoryGrid = document.querySelector(".inventory-grid");
  const orderList = document.querySelector(".order-list");
  const sellerId = 1;

  const orderButtons = {
    new: "Start packing",
    packing: "Mark ready",
    ready: "Complete",
  };

  const orderClasses = {
    new: "waiting",
    packing: "prepping",
    ready: "ready",
  };

  const titleCase = (value) => value.replace(/\b\w/g, (letter) => letter.toUpperCase());

  const renderInventory = (inventory) => {
    inventoryGrid.innerHTML = inventory.map((item) => `
      <article class="inventory-card strawberry" data-inventory-card data-candy-id="${item.candy_id}" data-stock-status="${item.status}">
        <div><p class="card-label">Catalog item</p><h3>${item.candy.name}</h3></div>
        <div class="inventory-meta">
          <span>$${(item.candy.price_cents / 100).toFixed(2)} · ${item.inventory_count} left</span>
          <strong data-stock-label>${titleCase(item.status)}</strong>
          <button class="mini-action" type="button" data-toggle-stock>${item.status === "out-of-stock" ? "Mark in stock" : "Mark out"}</button>
        </div>
      </article>`).join("") || '<p class="empty-state">No inventory assigned yet.</p>';
    inStockCount.textContent = inventory.filter((item) => item.status !== "out-of-stock").length;
  };

  const renderOrders = (orders) => {
    orderList.innerHTML = orders.map((order) => `
      <article class="order-row" data-order-row data-order-id="${order.id}">
        <div><strong>Order #${order.id}</strong><p>${order.items.map((item) => `${item.quantity} ${item.candy.name}`).join(", ")}</p></div>
        <div class="row-actions"><span class="status-pill ${orderClasses[order.status]}" data-order-status>${titleCase(order.status)}</span>${order.status === "ready" || order.status === "new" || order.status === "packing" ? `<button class="mini-action" type="button" data-next-order-status>${orderButtons[order.status]}</button>` : ""}</div>
      </article>`).join("") || '<p class="empty-state">No active pickup orders.</p>';
    activeOrderCount.textContent = orders.length;
  };

  const loadSellerDashboard = async () => {
    try {
      const [inventoryResponse, ordersResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/sellers/${sellerId}/inventory`),
        fetch(`${API_BASE_URL}/sellers/${sellerId}/orders`),
      ]);
      if (!inventoryResponse.ok || !ordersResponse.ok) throw new Error("Unable to load seller dashboard");
      renderInventory(await inventoryResponse.json());
      renderOrders(await ordersResponse.json());
    } catch (error) {
      console.error(error);
      orderList.innerHTML = '<p class="empty-state">Could not load seller data. Is the backend running?</p>';
    }
  };

  document.addEventListener("click", async (event) => {
    const stockButton = event.target.closest("[data-toggle-stock]");
    const orderButton = event.target.closest("[data-next-order-status]");
    try {
      if (stockButton) {
        const card = stockButton.closest("[data-inventory-card]");
        const status = card.dataset.stockStatus === "out-of-stock" ? "in-stock" : "out-of-stock";
        const response = await fetch(`${API_BASE_URL}/sellers/${sellerId}/inventory/${card.dataset.candyId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
        });
        if (!response.ok) throw new Error("Unable to update inventory");
        loadSellerDashboard();
      }
      if (orderButton) {
        const row = orderButton.closest("[data-order-row]");
        const current = row.querySelector("[data-order-status]").textContent.trim().toLowerCase();
        const status = { new: "packing", packing: "ready", ready: "completed" }[current];
        const response = await fetch(`${API_BASE_URL}/orders/${row.dataset.orderId}/status`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
        });
        if (!response.ok) throw new Error("Unable to update order");
        loadSellerDashboard();
      }
    } catch (error) {
      console.error(error);
    }
  });

  loadSellerDashboard();
}

const adminApp = document.querySelector("[data-admin-app]");

if (adminApp) {
  const activeSellerCount = document.querySelector("[data-active-seller-count]");
  const pendingReviewCount = document.querySelector("[data-pending-review-count]");
  const submittedApplicationList = adminApp.querySelector(".approval-list");

  const approvalClasses = {
    pending: "waiting",
    approved: "approved",
    rejected: "rejected",
  };

  const approvalLabels = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
  };

  const renderApplications = (applications) => {
    pendingReviewCount.textContent = applications.length;
    if (!applications.length) {
      submittedApplicationList.innerHTML =
        '<p class="empty-state">No applications waiting for review.</p>';
      return;
    }

    submittedApplicationList.innerHTML = applications
      .map((seller) => `
          <article class="approval-row" data-seller-id="${seller.id}">
            <div>
              <strong>${seller.shop_name}</strong>
              <p>${seller.neighborhood} | ${seller.pickup_window}</p>
              <p>Contact: ${seller.contact_name}</p>
            </div>
            <div class="approval-actions">
              <span class="status-pill ${approvalClasses[seller.status]}">${approvalLabels[seller.status]}</span>
              <button class="mini-action" type="button" data-approve-seller>Approve</button>
              <button class="soft-action" type="button" data-reject-seller>Reject</button>
            </div>
          </article>`)
      .join("");
  };

  const loadPendingApplications = async () => {
    try {
      const [pendingResponse, approvedResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/applications?status=pending`),
        fetch(`${API_BASE_URL}/applications?status=approved`),
      ]);
      if (!pendingResponse.ok || !approvedResponse.ok) throw new Error("Unable to load applications");
      activeSellerCount.textContent = (await approvedResponse.json()).length;
      renderApplications(await pendingResponse.json());
    } catch (error) {
      console.error(error);
      submittedApplicationList.innerHTML = '<p class="empty-state">Could not load applications. Is the backend running?</p>';
    }
  };

  document.addEventListener("click", async (event) => {
    const approveButton = event.target.closest("[data-approve-seller]");
    const rejectButton = event.target.closest("[data-reject-seller]");
    if (!approveButton && !rejectButton) return;
    const row = event.target.closest("[data-seller-id]");
    if (!row) return;

    try {
      const status = approveButton ? "approved" : "rejected";
      const response = await fetch(`${API_BASE_URL}/applications/${row.dataset.sellerId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Unable to update seller status");
      loadPendingApplications();
    } catch (error) {
      console.error(error);
    }
  });

  loadPendingApplications();
}
