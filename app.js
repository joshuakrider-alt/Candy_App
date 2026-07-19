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
};

const buyerApp = document.querySelector("[data-buyer-app]");

if (buyerApp) {
  const searchInput = document.querySelector("[data-search-input]");
  const filterButtons = [...document.querySelectorAll("[data-filter]")];
  const productCards = [...document.querySelectorAll("[data-product-card]")];
  const emptyState = document.querySelector("[data-empty-state]");
  const cartLines = document.querySelector("[data-cart-lines]");
  const cartTotal = document.querySelector("[data-cart-total]");
  const orderMessage = document.querySelector("[data-order-message]");
  const placeOrderButton = document.querySelector("[data-place-order]");
  const cart = new Map(
    storage.get("candyLadyCart", []).map((item) => [item.name, item])
  );
  let activeFilter = "all";

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

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
          <article class="cart-item" data-cart-item="${item.name}">
            <div class="cart-item-main">
              <strong>${item.name}</strong>
              <span>${money.format(item.price * item.qty)}</span>
            </div>
            <div class="cart-item-controls">
              <span>${money.format(item.price)} each</span>
              <div class="qty-controls" aria-label="${item.name} quantity">
                <button class="qty-button" type="button" data-cart-minus="${item.name}">-</button>
                <strong>${item.qty}</strong>
                <button class="qty-button" type="button" data-cart-plus="${item.name}">+</button>
              </div>
            </div>
          </article>
        `
      )
      .join("");
  };

  const filterProducts = () => {
    const query = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    productCards.forEach((card) => {
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
      const name = card.dataset.name;
      const price = Number(card.dataset.price);
      const existing = cart.get(name);

      cart.set(name, {
        name,
        price,
        qty: existing ? existing.qty + 1 : 1,
      });
      orderMessage.textContent = `${name} added to pickup order.`;
      renderCart();
    }

    if (plusButton) {
      const name = plusButton.dataset.cartPlus;
      const item = cart.get(name);
      cart.set(name, { ...item, qty: item.qty + 1 });
      renderCart();
    }

    if (minusButton) {
      const name = minusButton.dataset.cartMinus;
      const item = cart.get(name);

      if (item.qty === 1) {
        cart.delete(name);
      } else {
        cart.set(name, { ...item, qty: item.qty - 1 });
      }

      renderCart();
    }
  });

  placeOrderButton.addEventListener("click", () => {
    if (!cart.size) {
      orderMessage.textContent = "Add at least one snack before placing an order.";
      return;
    }

    orderMessage.textContent = "Pickup order placed for demo purposes.";
    cart.clear();
    renderCart();
  });

  filterProducts();
  renderCart();
}

const sellerApp = document.querySelector("[data-seller-app]");

if (sellerApp) {
  const stockCards = [...document.querySelectorAll("[data-inventory-card]")];
  const inStockCount = document.querySelector("[data-in-stock-count]");
  const activeOrderCount = document.querySelector("[data-seller-order-count]");
  const savedSellerState = storage.get("candyLadySellerState", {
    stock: {},
    orders: {},
  });

  const stockLabels = {
    in: "In stock",
    low: "Low stock",
    out: "Out of stock",
  };

  const orderButtons = {
    new: "Start packing",
    packing: "Mark ready",
    ready: "Complete",
    completed: "Remove",
  };

  const orderClasses = {
    new: "waiting",
    packing: "prepping",
    ready: "ready",
    completed: "done",
  };

  const saveSellerState = () => {
    const stock = Object.fromEntries(
      stockCards.map((card) => [card.dataset.stockId, card.dataset.stockStatus])
    );
    const orders = Object.fromEntries(
      [...document.querySelectorAll("[data-order-row]")].map((row) => {
        const status = row.querySelector("[data-order-status]").textContent
          .trim()
          .toLowerCase();
        return [row.dataset.orderId, status];
      })
    );

    storage.set("candyLadySellerState", { stock, orders });
  };

  const setOrderStatus = (row, statusName) => {
    const status = row.querySelector("[data-order-status]");
    const button = row.querySelector("[data-next-order-status]");
    const normalizedStatus = statusName.toLowerCase();

    status.classList.remove("waiting", "prepping", "ready", "done");
    status.textContent =
      normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1);
    status.classList.add(orderClasses[normalizedStatus]);
    button.textContent = orderButtons[normalizedStatus];
  };

  const applySavedSellerState = () => {
    stockCards.forEach((card) => {
      const savedStatus = savedSellerState.stock[card.dataset.stockId];
      const status = savedStatus || card.dataset.stockStatus;
      const label = card.querySelector("[data-stock-label]");
      const toggleButton = card.querySelector("[data-toggle-stock]");

      card.dataset.stockStatus = status;
      label.textContent = stockLabels[status];
      toggleButton.textContent = status === "out" ? "Mark in" : "Mark out";
    });

    document.querySelectorAll("[data-order-row]").forEach((row) => {
      const savedStatus = savedSellerState.orders[row.dataset.orderId];

      if (savedStatus) {
        setOrderStatus(row, savedStatus);
      }
    });
  };

  const updateSellerStats = () => {
    const stockedItems = stockCards.filter(
      (card) => card.dataset.stockStatus !== "out"
    ).length;
    const activeOrders = document.querySelectorAll("[data-order-row]").length;

    inStockCount.textContent = stockedItems;
    activeOrderCount.textContent = activeOrders;
  };

  document.addEventListener("click", (event) => {
    const toggleButton = event.target.closest("[data-toggle-stock]");
    const orderButton = event.target.closest("[data-next-order-status]");

    if (toggleButton) {
      const card = toggleButton.closest("[data-inventory-card]");
      const nextStatus = card.dataset.stockStatus === "out" ? "in" : "out";
      const label = card.querySelector("[data-stock-label]");

      card.dataset.stockStatus = nextStatus;
      label.textContent = stockLabels[nextStatus];
      toggleButton.textContent = nextStatus === "out" ? "Mark in" : "Mark out";
      updateSellerStats();
    }

    if (orderButton) {
      const row = orderButton.closest("[data-order-row]");
      const currentStatus = row
        .querySelector("[data-order-status]")
        .textContent.trim()
        .toLowerCase();

      if (currentStatus === "new") {
        setOrderStatus(row, "packing");
      } else if (currentStatus === "packing") {
        setOrderStatus(row, "ready");
      } else if (currentStatus === "ready") {
        setOrderStatus(row, "completed");
      } else {
        row.remove();
      }

      updateSellerStats();
      saveSellerState();
    }
  });

  applySavedSellerState();
  updateSellerStats();
}

const adminApp = document.querySelector("[data-admin-app]");

if (adminApp) {
  const activeSellerCount = document.querySelector("[data-active-seller-count]");
  const pendingReviewCount = document.querySelector("[data-pending-review-count]");
  const savedAdminState = storage.get("candyLadyAdminState", {
    activeSellers: Number(activeSellerCount.textContent),
    approvals: {},
  });

  const approvalClasses = {
    pending: "waiting",
    "needs-docs": "prepping",
    approved: "approved",
    rejected: "rejected",
  };

  const approvalLabels = {
    pending: "Pending",
    "needs-docs": "Needs docs",
    approved: "Approved",
    rejected: "Rejected",
  };

  const setApprovalStatus = (row, status) => {
    const label = row.querySelector("[data-approval-label]");
    row.dataset.approvalStatus = status;
    label.classList.remove("waiting", "prepping", "approved", "rejected");
    label.textContent = approvalLabels[status];
    label.classList.add(approvalClasses[status]);

    if (["approved", "rejected"].includes(status)) {
      row.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
        button.classList.add("disabled-action");
      });
    }
  };

  const saveAdminState = () => {
    const approvals = Object.fromEntries(
      [...document.querySelectorAll("[data-approval-row]")].map((row) => [
        row.dataset.approvalId,
        row.dataset.approvalStatus,
      ])
    );

    storage.set("candyLadyAdminState", {
      activeSellers: Number(activeSellerCount.textContent),
      approvals,
    });
  };

  const applySavedAdminState = () => {
    activeSellerCount.textContent = savedAdminState.activeSellers;

    document.querySelectorAll("[data-approval-row]").forEach((row) => {
      const status =
        savedAdminState.approvals[row.dataset.approvalId] ||
        row.dataset.approvalStatus;
      setApprovalStatus(row, status);
    });
  };

  const updateAdminStats = () => {
    const pendingRows = [
      ...document.querySelectorAll("[data-approval-row]"),
    ].filter((row) => {
      return !["approved", "rejected"].includes(row.dataset.approvalStatus);
    });

    pendingReviewCount.textContent = pendingRows.length;
  };

  document.addEventListener("click", (event) => {
    const approveButton = event.target.closest("[data-approve-seller]");
    const rejectButton = event.target.closest("[data-reject-seller]");

    if (!approveButton && !rejectButton) return;

    const row = event.target.closest("[data-approval-row]");

    if (approveButton) {
      setApprovalStatus(row, "approved");
      activeSellerCount.textContent = String(Number(activeSellerCount.textContent) + 1);
    }

    if (rejectButton) {
      setApprovalStatus(row, "rejected");
    }

    updateAdminStats();
    saveAdminState();
  });

  applySavedAdminState();
  updateAdminStats();
}
