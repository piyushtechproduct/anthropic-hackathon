const messagesContainer = document.getElementById("messages")!;
const promptInput = document.getElementById("prompt-input") as HTMLInputElement;
const sendBtn = document.getElementById("send-btn")!;

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

function handleSend() {
  const text = promptInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  promptInput.value = "";

  chrome.runtime.sendMessage({ type: "SEARCH_REQUEST", prompt: text });
}

sendBtn.addEventListener("click", handleSend);
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATUS") {
    addMessage(message.message, "system");
  } else if (message.type === "RESULT") {
    const { filters_applied, filters_failed, search_url } = message.data;
    let html = "";
    if (filters_applied.length > 0) {
      html += `✅ Applied ${filters_applied.length} filter(s): ${filters_applied.join(", ")}<br>`;
    }
    if (filters_failed.length > 0) {
      html += `⚠️ Could not find: ${filters_failed.join(", ")}<br>`;
    }
    if (filters_applied.length === 0 && filters_failed.length === 0) {
      html += "Showing search results.";
    }
    html += `<br><a href="${search_url}" style="color: inherit;">${search_url}</a>`;
    addMessage(html, "result");
  } else if (message.type === "ERROR") {
    addMessage(message.message, "error");
  }
});

addMessage(
  "Hi! Tell me what you want to buy and I'll find it on Amazon India.",
  "system",
);
