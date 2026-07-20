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
  const productCards = [...document.querySelectorAll("[data-product-card]")];
  const emptyState = document.querySelector("[data-empty-state]");
  const cartLines = document.querySelector("[data-cart-lines]");
  const cartTotal = document.querySelector("[data-cart-total]");
  const pickupCode = document.querySelector("[data-pickup-code]");
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
  renderSubmittedApplications();
  updateAdminStats();
}
