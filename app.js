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

const appData = window.CANDY_LADY_DATA || { products: [], sellers: [], source: null };
const sellersById = new Map(appData.sellers.map((seller) => [seller.id, seller]));

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const escapeHTML = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const getSeller = (product) => sellersById.get(product.sellerId) || appData.sellers[0];

const renderSourceNote = (target) => {
  if (!target || !appData.source) return;

  target.innerHTML = `Product data seeded from <a href="${appData.source.url}" target="_blank" rel="noreferrer">${appData.source.name}</a>, pulled ${appData.source.pulledAt}. Prices, seller assignment, and stock are demo marketplace values.`;
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

const applicationApp = document.querySelector("[data-application-app]");

if (applicationApp) {
  const form = document.querySelector("[data-application-form]");
  const message = document.querySelector("[data-application-message]");
  const preview = document.querySelector("[data-application-preview]");

  const renderApplicationPreview = () => {
    const applications = storage.get("candyLadyApplications", []);
    const latest = applications.at(-1);

    if (!latest) return;

    preview.innerHTML = `
      <div><span>Status</span><strong>Pending review</strong></div>
      <div><span>Shop</span><strong>${latest.shopName}</strong></div>
      <div><span>Neighborhood</span><strong>${latest.neighborhood}</strong></div>
      <div><span>Categories</span><strong>${latest.categories.join(", ") || "None selected"}</strong></div>
    `;
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const applications = storage.get("candyLadyApplications", []);
    const application = {
      id: `app-${Date.now()}`,
      shopName: formData.get("shopName").trim(),
      contactName: formData.get("contactName").trim(),
      neighborhood: formData.get("neighborhood").trim(),
      pickupWindow: formData.get("pickupWindow").trim(),
      pickupNotes: formData.get("pickupNotes").trim(),
      categories: formData.getAll("categories"),
      status: "pending",
      submittedAt: new Date().toISOString(),
    };

    storage.set("candyLadyApplications", [...applications, application]);
    message.textContent = "Application saved for demo review.";
    form.reset();
    renderApplicationPreview();
  });

  renderApplicationPreview();
}

if (buyerApp) {
  const searchInput = document.querySelector("[data-search-input]");
  const filterButtons = [...document.querySelectorAll("[data-filter]")];
  const productList = document.querySelector("[data-product-list]");
  const sellerCardGrid = document.querySelector(".seller-card-grid");
  const sourceNote = document.querySelector("[data-data-source]");
  const emptyState = document.querySelector("[data-empty-state]");
  const cartLines = document.querySelector("[data-cart-lines]");
  const cartTotal = document.querySelector("[data-cart-total]");
  const pickupCode = document.querySelector("[data-pickup-code]");
  const orderMessage = document.querySelector("[data-order-message]");
  const placeOrderButton = document.querySelector("[data-place-order]");
  const cart = new Map(
    storage.get("candyLadyCart", []).map((item) => [item.id || item.name, item])
  );
  let activeFilter = "all";

  const renderSellers = () => {
    if (!sellerCardGrid || !appData.sellers.length) return;

    sellerCardGrid.innerHTML = appData.sellers
      .map((seller, index) => {
        const sellerProducts = appData.products
          .filter((product) => product.sellerId === seller.id)
          .slice(0, 3);

        return `
          <article class="seller-card ${index === 0 ? "feature-card" : ""}">
            <div class="seller-card-top">
              <div>
                <p class="card-label">${seller.open ? "Open now" : "Closed now"}</p>
                <h3>${escapeHTML(seller.name)}</h3>
              </div>
              <span class="pill-price">${seller.rating}</span>
            </div>
            <p>${escapeHTML(seller.neighborhood)} | ${escapeHTML(seller.pickupTime)}</p>
            <div class="badge-row">
              ${seller.tags.map((tag) => `<span>${escapeHTML(tag)}</span>`).join("")}
            </div>
            <div class="quick-items">
              ${sellerProducts
                .map(
                  (product) =>
                    `<div><strong>${escapeHTML(product.name)}</strong><span>${money.format(product.price)}</span></div>`
                )
                .join("")}
            </div>
          </article>
        `;
      })
      .join("");
  };

  const renderProducts = () => {
    if (!productList || !appData.products.length) return;

    productList.innerHTML = appData.products
      .map((product) => {
        const seller = getSeller(product);
        const open = product.open ?? seller?.open ?? false;

        return `
          <article
            class="catalog-row ${product.style}"
            data-product-card
            data-product-id="${product.id}"
            data-category="${product.category}"
            data-open="${open}"
            data-name="${escapeHTML(`${product.name} ${product.brand} ${seller?.name || ""}`)}"
            data-price="${product.price}"
          >
            <img class="product-thumb" src="${product.image}" alt="${escapeHTML(product.name)} package" loading="lazy" />
            <div class="catalog-copy">
              <p class="card-label">${escapeHTML(product.brand)} | ${escapeHTML(product.categoryLabel)}</p>
              <h3>${escapeHTML(product.name)}</h3>
              <p>${escapeHTML(seller?.name)} | ${escapeHTML(product.servingSize)}</p>
              <div class="product-facts">
                <span>${escapeHTML(product.calories)}</span>
                <span>${escapeHTML(product.sugars)}</span>
                <span>Nutri-Score ${escapeHTML(product.nutriScore)}</span>
                <a href="${product.sourceUrl}" target="_blank" rel="noreferrer">OFF #${escapeHTML(product.barcode)}</a>
              </div>
            </div>
            <div class="catalog-actions">
              <strong>${money.format(product.price)}</strong>
              <button class="mini-action" type="button" data-add-to-cart>Add</button>
            </div>
          </article>
        `;
      })
      .join("");
  };

  renderSellers();
  renderProducts();
  renderSourceNote(sourceNote);

  const productCards = [...document.querySelectorAll("[data-product-card]")];

  const renderCart = () => {
    const items = [...cart.values()].map((item) => ({
      ...item,
      id: item.id || item.name,
    }));
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
              <strong>${escapeHTML(item.name)}</strong>
              <span>${money.format(item.price * item.qty)}</span>
            </div>
            <div class="cart-item-controls">
              <span>${money.format(item.price)} each</span>
              <div class="qty-controls" aria-label="${escapeHTML(item.name)} quantity">
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
      const product =
        appData.products.find((item) => item.id === card.dataset.productId) || {
          id: card.dataset.name,
          name: card.dataset.name,
          price: Number(card.dataset.price),
        };
      const existing = cart.get(product.id);

      cart.set(product.id, {
        id: product.id,
        name: product.name,
        price: product.price,
        qty: existing ? existing.qty + 1 : 1,
      });
      orderMessage.textContent = `${product.name} added to pickup order.`;
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

  placeOrderButton.addEventListener("click", () => {
    if (!cart.size) {
      orderMessage.textContent = "Add at least one snack before placing an order.";
      return;
    }

    const code = `CL-${Math.floor(1000 + Math.random() * 9000)}`;

    storage.set("candyLadyLastPickupCode", code);
    pickupCode.textContent = code;
    orderMessage.textContent = `Pickup order placed. Show code ${code} at pickup.`;
    cart.clear();
    renderCart();
  });

  filterProducts();
  renderCart();
  renderPickupCode();
}

const sellerApp = document.querySelector("[data-seller-app]");

if (sellerApp) {
  const inventoryGrid = document.querySelector(".inventory-grid");
  const orderList = document.querySelector(".order-list");
  const profileTitle = document.querySelector(".profile-stack")?.previousElementSibling?.querySelector("h2");
  const profileStack = document.querySelector(".profile-stack");
  const inStockCount = document.querySelector("[data-in-stock-count]");
  const activeOrderCount = document.querySelector("[data-seller-order-count]");
  const savedSellerState = storage.get("candyLadySellerState", {
    stock: {},
    orders: {},
  });
  const primarySeller = appData.sellers[0];
  const sellerProducts = appData.products.filter(
    (product) => product.sellerId === primarySeller?.id
  );

  if (profileTitle && primarySeller) profileTitle.textContent = primarySeller.name;
  if (profileStack && primarySeller) {
    profileStack.innerHTML = `
      <div><span>Neighborhood</span><strong>${escapeHTML(primarySeller.neighborhood)}</strong></div>
      <div><span>Hours</span><strong>2:30 PM - 7:00 PM</strong></div>
      <div><span>Pickup note</span><strong>Use side porch bell</strong></div>
      <div><span>Payment</span><strong>Cash, Cash App, card reader</strong></div>
      <div><span>Data source</span><strong>${escapeHTML(appData.source?.name || "Demo catalog")}</strong></div>
    `;
  }

  if (inventoryGrid && sellerProducts.length) {
    inventoryGrid.innerHTML = sellerProducts
      .map(
        (product) => `
          <article class="inventory-card ${product.style}" data-inventory-card data-stock-id="${product.id}" data-stock-status="${product.stock}">
            <img class="product-thumb" src="${product.image}" alt="${escapeHTML(product.name)} package" loading="lazy" />
            <div>
              <p class="card-label">${escapeHTML(product.brand)} | ${escapeHTML(product.categoryLabel)}</p>
              <h3>${escapeHTML(product.name)}</h3>
              <p>${escapeHTML(product.calories)} | ${escapeHTML(product.sugars)} | OFF #${escapeHTML(product.barcode)}</p>
            </div>
            <div class="inventory-meta">
              <span>${money.format(product.price)}</span>
              <strong data-stock-label>${product.stock === "low" ? "Low stock" : "In stock"}</strong>
              <button class="mini-action" type="button" data-toggle-stock>Mark out</button>
            </div>
          </article>
        `
      )
      .join("");
  }

  if (orderList && sellerProducts.length) {
    orderList.innerHTML = [
      ["1082", "ready", `2 ${sellerProducts[0].name}, 1 ${sellerProducts[1]?.name || "drink"}`],
      ["1084", "packing", `1 ${sellerProducts[2]?.name || sellerProducts[0].name}`],
      ["1088", "new", `3 ${sellerProducts[3]?.name || sellerProducts[0].name}`],
    ]
      .map(([id, status, text]) => `
        <article class="order-row" data-order-row data-order-id="${id}">
          <div>
            <strong>Order #${id}</strong>
            <p>${escapeHTML(text)}</p>
          </div>
          <div class="row-actions">
            <span class="status-pill" data-order-status>${status}</span>
            <button class="mini-action" type="button" data-next-order-status></button>
          </div>
        </article>
      `)
      .join("");
  }

  const stockCards = [...document.querySelectorAll("[data-inventory-card]")];

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
      } else {
        setOrderStatus(
          row,
          row.querySelector("[data-order-status]").textContent.trim().toLowerCase()
        );
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
  const approvedItemCount = document.querySelector("[data-approved-item-count]");
  const pendingReviewCount = document.querySelector("[data-pending-review-count]");
  const catalogAdminGrid = document.querySelector(".catalog-admin-grid");
  const submittedApplicationList = document.querySelector(
    "[data-submitted-application-list]"
  );
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

  if (approvedItemCount) approvedItemCount.textContent = appData.products.length;

  const renderCatalogAdmin = () => {
    if (!catalogAdminGrid || !appData.products.length) return;

    catalogAdminGrid.innerHTML = appData.products
      .map(
        (product) => `
          <article class="catalog-admin-card ${product.style}">
            <img class="product-thumb" src="${product.image}" alt="${escapeHTML(product.name)} package" loading="lazy" />
            <p class="card-label">${escapeHTML(product.brand)} | ${escapeHTML(product.categoryLabel)}</p>
            <h3>${escapeHTML(product.name)}</h3>
            <p>${escapeHTML(product.servingSize)} | ${escapeHTML(product.calories)} | Nutri-Score ${escapeHTML(product.nutriScore)}</p>
            <a class="source-link" href="${product.sourceUrl}" target="_blank" rel="noreferrer">Open Food Facts #${escapeHTML(product.barcode)}</a>
          </article>
        `
      )
      .join("");
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
    const applications = storage.get("candyLadyApplications", []);
    const pendingRows = [
      ...document.querySelectorAll("[data-approval-row]"),
    ].filter((row) => {
      return !["approved", "rejected"].includes(row.dataset.approvalStatus);
    });
    const pendingApplications = applications.filter((application) => {
      return !["approved", "rejected"].includes(application.status);
    });

    pendingReviewCount.textContent = pendingRows.length + pendingApplications.length;
  };

  const saveApplications = (applications) => {
    storage.set("candyLadyApplications", applications);
  };

  const renderSubmittedApplications = () => {
    const applications = storage.get("candyLadyApplications", []);

    if (!applications.length) {
      submittedApplicationList.innerHTML =
        '<p class="empty-state">No submitted applications yet.</p>';
      return;
    }

    submittedApplicationList.innerHTML = applications
      .map((application) => {
        const statusClass = approvalClasses[application.status] || "waiting";
        const statusLabel = approvalLabels[application.status] || "Pending";
        const disabled = ["approved", "rejected"].includes(application.status)
          ? "disabled"
          : "";
        const disabledClass = disabled ? " disabled-action" : "";

        return `
          <article class="approval-row" data-submitted-application-id="${application.id}">
            <div>
              <strong>${application.shopName}</strong>
              <p>${application.neighborhood} | ${application.pickupWindow}</p>
              <p>Requested categories: ${application.categories.join(", ") || "None selected"}</p>
              <p>Contact: ${application.contactName}</p>
            </div>
            <div class="approval-actions">
              <span class="status-pill ${statusClass}">${statusLabel}</span>
              <button class="mini-action${disabledClass}" type="button" data-approve-application ${disabled}>Approve</button>
              <button class="soft-action${disabledClass}" type="button" data-reject-application ${disabled}>Reject</button>
            </div>
          </article>
        `;
      })
      .join("");
  };

  document.addEventListener("click", (event) => {
    const approveButton = event.target.closest("[data-approve-seller]");
    const rejectButton = event.target.closest("[data-reject-seller]");
    const approveApplicationButton = event.target.closest(
      "[data-approve-application]"
    );
    const rejectApplicationButton = event.target.closest(
      "[data-reject-application]"
    );

    if (
      !approveButton &&
      !rejectButton &&
      !approveApplicationButton &&
      !rejectApplicationButton
    ) {
      return;
    }

    if (approveApplicationButton || rejectApplicationButton) {
      const row = event.target.closest("[data-submitted-application-id]");
      const applicationId = row.dataset.submittedApplicationId;
      const applications = storage.get("candyLadyApplications", []);
      const updatedApplications = applications.map((application) => {
        if (application.id !== applicationId) return application;

        return {
          ...application,
          status: approveApplicationButton ? "approved" : "rejected",
        };
      });

      if (approveApplicationButton) {
        activeSellerCount.textContent = String(Number(activeSellerCount.textContent) + 1);
      }

      saveApplications(updatedApplications);
      renderSubmittedApplications();
      updateAdminStats();
      saveAdminState();
      return;
    }

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
  renderCatalogAdmin();
  renderSubmittedApplications();
  updateAdminStats();
}
