interface Product {
  title: string;
  price: number;
  rating: number | null;
  review_count: number | null;
  image_url: string;
  product_url: string;
  platform: string;
}

const messagesContainer = document.getElementById("messages")!;
const promptInput = document.getElementById("prompt-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

let isProcessing = false;
let currentStatusEl: HTMLElement | null = null;

function addMessage(
  text: string,
  type: "user" | "system" | "error" | "result",
) {
  const msg = document.createElement("div");
  msg.className = `message ${type}`;
  msg.innerHTML = text;
  messagesContainer.appendChild(msg);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setProcessing(active: boolean) {
  isProcessing = active;
  sendBtn.disabled = active;
  promptInput.disabled = active;
  if (active) {
    promptInput.placeholder = "Working on it...";
  } else {
    promptInput.placeholder = "What do you want to buy?";
    promptInput.focus();
  }
}

function handleSend() {
  const text = promptInput.value.trim();
  if (!text || isProcessing) return;

  addMessage(text, "user");
  promptInput.value = "";
  setProcessing(true);

  chrome.runtime.sendMessage({ type: "SEARCH_REQUEST", prompt: text });
}

sendBtn.addEventListener("click", handleSend);
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

function removeStatusBubble() {
  if (currentStatusEl) {
    currentStatusEl.remove();
    currentStatusEl = null;
  }
}

function setStatus(text: string) {
  const html = `<span class="spinner"></span>${text}`;
  if (currentStatusEl) {
    currentStatusEl.innerHTML = html;
  } else {
    const msg = document.createElement("div");
    msg.className = "message system status";
    msg.innerHTML = html;
    messagesContainer.appendChild(msg);
    currentStatusEl = msg;
  }
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Product carousel rendering ---

function escapeHtml(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatReviewCount(count: number): string {
  if (count >= 100000) return `${(count / 100000).toFixed(1)}L`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}

function renderProductCarousel(products: Product[], query: string) {
  const container = document.createElement("div");
  container.className = "carousel-container";

  const header = document.createElement("div");
  header.className = "carousel-header";
  header.textContent = `Top ${products.length} results for "${query}"`;
  container.appendChild(header);

  const carousel = document.createElement("div");
  carousel.className = "carousel";

  for (const product of products) {
    const card = document.createElement("a");
    card.className = "product-card";
    card.href = product.product_url;
    card.target = "_blank";
    card.rel = "noopener";

    // Image section with platform badge
    const imgSection = document.createElement("div");
    imgSection.className = "product-card-img";

    const badge = document.createElement("span");
    badge.className = `platform-badge ${product.platform}`;
    badge.textContent = product.platform === "amazon" ? "Amazon" : "Flipkart";
    imgSection.appendChild(badge);

    if (product.image_url) {
      const img = document.createElement("img");
      img.src = product.image_url;
      img.alt = product.title;
      img.loading = "lazy";
      imgSection.appendChild(img);
    }

    card.appendChild(imgSection);

    // Info section
    const info = document.createElement("div");
    info.className = "product-card-info";

    const title = document.createElement("div");
    title.className = "product-card-title";
    title.textContent = product.title;
    info.appendChild(title);

    const price = document.createElement("div");
    price.className = "product-card-price";
    price.textContent = formatPrice(product.price);
    info.appendChild(price);

    // Rating + review count
    const meta = document.createElement("div");
    meta.className = "product-card-meta";

    if (product.rating) {
      const ratingPill = document.createElement("span");
      ratingPill.className = "rating-pill";
      ratingPill.innerHTML = `${product.rating.toFixed(1)} &#9733;`;
      meta.appendChild(ratingPill);
    }

    if (product.review_count) {
      const reviews = document.createElement("span");
      reviews.className = "review-count";
      reviews.textContent = `${formatReviewCount(product.review_count)} reviews`;
      meta.appendChild(reviews);
    }

    if (product.rating || product.review_count) {
      info.appendChild(meta);
    }

    card.appendChild(info);
    carousel.appendChild(card);
  }

  container.appendChild(carousel);
  messagesContainer.appendChild(container);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- Message handler ---

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS") {
    setStatus(message.message);
  } else if (message.type === "PRODUCTS") {
    removeStatusBubble();
    setProcessing(false);
    renderProductCarousel(message.products, message.query);
  } else if (message.type === "RESULT") {
    removeStatusBubble();
    setProcessing(false);
    const { filters_applied, filters_failed, search_url } = message.data;
    let html = "";
    if (filters_applied.length > 0) {
      html += `<strong>Applied ${filters_applied.length} filter(s):</strong><br>`;
      html += filters_applied.map((f: string) => `  ${f}`).join("<br>");
      html += "<br>";
    }
    if (filters_failed.length > 0) {
      html += `<strong>Could not find:</strong><br>`;
      html += filters_failed.map((f: string) => `  ${f}`).join("<br>");
      html += "<br>";
    }
    if (filters_applied.length === 0 && filters_failed.length === 0) {
      html += "Showing search results — no specific filters to apply.";
    }
    html += `<br><a href="${escapeHtml(search_url)}" target="_blank" style="color: inherit; text-decoration: underline;">View results</a>`;
    addMessage(html, "result");
  } else if (message.type === "ERROR") {
    removeStatusBubble();
    setProcessing(false);
    addMessage(escapeHtml(message.message), "error");
  }
});

addMessage(
  "Hi! Tell me what you want to buy and I'll find the best deals across Amazon India and Flipkart.",
  "system",
);
