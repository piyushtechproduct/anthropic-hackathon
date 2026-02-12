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

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS") {
    setStatus(message.message);
  } else if (message.type === "RESULT") {
    removeStatusBubble();
    setProcessing(false);
    const { filters_applied, filters_failed, search_url } = message.data;
    let html = "";
    if (filters_applied.length > 0) {
      html += `<strong>Applied ${filters_applied.length} filter(s):</strong><br>`;
      html += filters_applied.map((f: string) => `  ✅ ${f}`).join("<br>");
      html += "<br>";
    }
    if (filters_failed.length > 0) {
      html += `<strong>Could not find:</strong><br>`;
      html += filters_failed.map((f: string) => `  ⚠️ ${f}`).join("<br>");
      html += "<br>";
    }
    if (filters_applied.length === 0 && filters_failed.length === 0) {
      html += "Showing search results — no specific filters to apply.";
    }
    html += `<br><a href="${search_url}" target="_blank" style="color: inherit; text-decoration: underline;">View on Amazon</a>`;
    addMessage(html, "result");
  } else if (message.type === "ERROR") {
    removeStatusBubble();
    setProcessing(false);
    addMessage(message.message, "error");
  }
});

addMessage(
  "Hi! Tell me what you want to buy and I'll find it on Amazon India.",
  "system",
);
