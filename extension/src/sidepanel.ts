/**
 * Side Panel UI - Chat interface for AI Commerce Agent
 */

import type { Product, Message } from './types';

let messagesContainer: HTMLDivElement;
let promptInput: HTMLTextAreaElement;
let sendBtn: HTMLButtonElement;

// Conversation history for context
const conversationHistory: string[] = [];

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  // Get DOM elements
  messagesContainer = document.getElementById('messages') as HTMLDivElement;
  promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
  sendBtn = document.getElementById('send-btn') as HTMLButtonElement;

  // Display welcome message
  addMessage('system', 'Welcome! 👋 Tell me what you\'re looking for, and I\'ll search Amazon and Flipkart for you.');

  // Send button click
  sendBtn.addEventListener('click', handleSend);

  // Enter key to send (Shift+Enter for newline)
  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
});

function handleSend() {
  const prompt = promptInput.value.trim();
  if (!prompt) return;

  // Display user message
  addMessage('user', prompt);

  // Add to conversation history
  conversationHistory.push(prompt);

  // Keep only last 5 prompts for context (to avoid token limits)
  if (conversationHistory.length > 5) {
    conversationHistory.shift();
  }

  promptInput.value = '';

  // Disable input while processing
  setInputEnabled(false);

  // Send message to background script with conversation history
  chrome.runtime.sendMessage({
    type: 'SEARCH_REQUEST',
    payload: {
      prompt,
      conversation_history: conversationHistory.slice(0, -1) // Exclude current prompt
    }
  });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message: Message) => {
  switch (message.type) {
    case 'STATUS':
      addMessage('system', message.payload.text);
      break;

    case 'PRODUCTS':
      displayProducts(message.payload.products);
      setInputEnabled(true);
      break;

    case 'ERROR':
      addMessage('error', message.payload.text);
      setInputEnabled(true);
      break;
  }
});

function addMessage(type: 'user' | 'system' | 'error', text: string) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.textContent = text;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayProducts(products: Product[]) {
  if (products.length === 0) {
    addMessage('system', 'No products found. Try adjusting your search criteria.');
    return;
  }

  const productsMessage = document.createElement('div');
  productsMessage.className = 'message system';

  const heading = document.createElement('div');
  heading.style.marginBottom = '12px';
  heading.style.fontWeight = '600';
  heading.textContent = `Found ${products.length} products:`;
  productsMessage.appendChild(heading);

  const carousel = document.createElement('div');
  carousel.className = 'products-carousel';

  products.forEach(product => {
    const card = createProductCard(product);
    carousel.appendChild(card);
  });

  productsMessage.appendChild(carousel);
  messagesContainer.appendChild(productsMessage);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function createProductCard(product: Product): HTMLElement {
  const card = document.createElement('a');
  card.className = 'product-card';
  card.href = product.product_url;
  card.target = '_blank';

  // Product image
  const img = document.createElement('img');
  img.className = 'product-image';
  img.src = product.image_url;
  img.alt = product.title;
  img.loading = 'lazy';
  card.appendChild(img);

  // Product title
  const title = document.createElement('div');
  title.className = 'product-title';
  title.textContent = product.title;
  card.appendChild(title);

  // Product price
  const price = document.createElement('div');
  price.className = 'product-price';
  price.textContent = `₹${product.price.toLocaleString('en-IN')}`;
  card.appendChild(price);

  // Rating and reviews
  const rating = document.createElement('div');
  rating.className = 'product-rating';
  const reviewText = formatReviewCount(product.review_count);
  rating.textContent = `${product.rating}★ (${reviewText})`;
  card.appendChild(rating);

  // Platform badge
  const badge = document.createElement('span');
  badge.className = `platform-badge ${product.platform.toLowerCase()}`;
  badge.textContent = product.platform === 'amazon' ? 'Amazon' : 'Flipkart';
  card.appendChild(badge);

  return card;
}

function formatReviewCount(count: number): string {
  if (count >= 100000) {
    return `${(count / 100000).toFixed(1)}L`;
  } else if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

function setInputEnabled(enabled: boolean) {
  promptInput.disabled = !enabled;
  sendBtn.disabled = !enabled;

  if (!enabled) {
    sendBtn.innerHTML = '<span class="spinner"></span>';
  } else {
    sendBtn.textContent = 'Send';
    promptInput.focus();
  }
}
