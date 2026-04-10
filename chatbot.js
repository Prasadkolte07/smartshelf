// ── CHATBOT SYSTEM ──
class SmartShelfChatbot {
  constructor() {
    this.isOpen = false;
    this.messages = [];
    this.unreadCount = 0;
    this.isWaitingForResponse = false;
    this.init();
  }

  init() {
    this.createChatbotHTML();
    this.setupEventListeners();
    this.addWelcomeMessage();
  }

  createChatbotHTML() {
    const chatbotHTML = `
      <div class="chatbot-widget">
        <div class="chatbot-container" id="chatbotContainer">
          <div class="chatbot-header">
            <div>
              <div class="chatbot-header-title">
                <span class="chatbot-header-icon">💬</span>
                <div>
                  <div>SmartShelf Support</div>
                  <div class="chatbot-header-status">Online • Ready to help</div>
                </div>
              </div>
            </div>
            <button class="chatbot-close-btn" id="chatbotCloseBtn">✕</button>
          </div>
          <div class="chatbot-messages" id="chatbotMessages"></div>
          <div class="chatbot-input-area">
            <input 
              type="text" 
              class="chatbot-input" 
              id="chatbotInput" 
              placeholder="Type your question..."
              autocomplete="off"
            >
            <button class="chatbot-send-btn" id="chatbotSendBtn">📤</button>
          </div>
        </div>
        <button class="chatbot-toggle-btn" id="chatbotToggleBtn" title="Open chat">
          💬
          <span class="chatbot-badge" id="chatbotBadge" style="display:none;">1</span>
        </button>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatbotHTML);
  }

  setupEventListeners() {
    const toggleBtn = document.getElementById('chatbotToggleBtn');
    const closeBtn = document.getElementById('chatbotCloseBtn');
    const sendBtn = document.getElementById('chatbotSendBtn');
    const input = document.getElementById('chatbotInput');

    toggleBtn.addEventListener('click', () => this.toggle());
    closeBtn.addEventListener('click', () => this.close());
    sendBtn.addEventListener('click', () => this.sendMessage());
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    const container = document.getElementById('chatbotContainer');
    const toggleBtn = document.getElementById('chatbotToggleBtn');
    const badge = document.getElementById('chatbotBadge');

    container.classList.add('active');
    toggleBtn.style.display = 'none';
    badge.style.display = 'none';
    this.isOpen = true;
    this.unreadCount = 0;
    document.getElementById('chatbotInput').focus();
  }

  close() {
    const container = document.getElementById('chatbotContainer');
    const toggleBtn = document.getElementById('chatbotToggleBtn');

    container.classList.remove('active');
    toggleBtn.style.display = 'flex';
    this.isOpen = false;
  }

  addMessage(text, isUser = false) {
    const messagesContainer = document.getElementById('chatbotMessages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${isUser ? 'user' : 'bot'}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = isUser ? '👤' : '🤖';

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;

    if (isUser) {
      messageEl.appendChild(content);
      messageEl.appendChild(avatar);
    } else {
      messageEl.appendChild(avatar);
      messageEl.appendChild(content);
    }

    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    if (!isUser && !this.isOpen) {
      this.unreadCount++;
      this.updateBadge();
    }
  }

  addWelcomeMessage() {
    setTimeout(() => {
      this.addMessage("👋 Hi there! Welcome to SmartShelf. How can I help you today? You can ask about:\n\n• 📦 Products & pricing\n• 🚚 Orders & shipping\n• 💳 Payment options\n• 🏪 Vendor partnerships\n• ❓ General questions");
    }, 500);
  }

  sendMessage() {
    const input = document.getElementById('chatbotInput');
    const message = input.value.trim();

    if (!message) return;

    this.addMessage(message, true);
    input.value = '';

    this.isWaitingForResponse = true;
    this.showTyping();

    // Simulate response delay
    setTimeout(() => {
      this.isWaitingForResponse = false;
      this.removeTyping();
      this.generateResponse(message);
    }, 1000 + Math.random() * 500);
  }

  showTyping() {
    const messagesContainer = document.getElementById('chatbotMessages');
    const typingEl = document.createElement('div');
    typingEl.className = 'message bot';
    typingEl.id = 'typingIndicator';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '🤖';

    const dots = document.createElement('div');
    dots.className = 'typing-indicator';
    dots.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

    typingEl.appendChild(avatar);
    typingEl.appendChild(dots);
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  removeTyping() {
    const typingEl = document.getElementById('typingIndicator');
    if (typingEl) typingEl.remove();
  }

  generateResponse(userMessage) {
    const message = userMessage.toLowerCase();
    let response = '';

    // Product queries
    if (message.includes('product') || message.includes('item') || message.includes('buy')) {
      response = "🛍️ Great question! We have a wide range of electronics including smartphones, laptops, headphones, and more. Visit our Products page to explore our complete catalog with real-time pricing and stock availability. Would you like recommendations for a specific category?";
    }
    // Pricing queries
    else if (message.includes('price') || message.includes('cost') || message.includes('discount')) {
      response = "💰 Our prices are competitive and updated in real-time. We offer various discounts and deals on different products. Check out our Flash Sale section for amazing offers. Are you looking for something specific?";
    }
    // Shipping/Delivery queries
    else if (message.includes('shipping') || message.includes('delivery') || message.includes('track') || message.includes('order')) {
      response = "🚚 We provide fast and reliable shipping across India. Most orders are delivered within 3-5 business days. You can track your order in real-time from your account dashboard. Need help with a specific order?";
    }
    // Payment queries
    else if (message.includes('payment') || message.includes('pay') || message.includes('credit') || message.includes('card') || message.includes('upi')) {
      response = "💳 We accept multiple payment methods: Credit/Debit Cards, UPI, Digital Wallets, and EMI options. All transactions are secure with SSL encryption and PCI DSS compliance. Is there a specific payment method you'd like to know more about?";
    }
    // Vendor/Seller queries
    else if (message.includes('vendor') || message.includes('seller') || message.includes('business') || message.includes('partnership')) {
      response = "🏪 Interested in becoming a vendor? We offer attractive terms and subscription plans:\n\n• 💼 Starter: ₹999/month\n• 📊 Professional: ₹4,999/month (with analytics)\n• 🏢 Enterprise: Custom pricing\n\nVisit our Vendor Portal to get started!";
    }
    // Return/Refund queries
    else if (message.includes('return') || message.includes('refund') || message.includes('exchange')) {
      response = "↩️ We offer a 30-day return policy. Items must be in original condition with all packaging. You can initiate returns from your account dashboard, and we handle pickup and refund processing. Any specific issue with an order?";
    }
    // Account/Login queries
    else if (message.includes('account') || message.includes('login') || message.includes('sign up') || message.includes('register')) {
      response = "👤 You can create an account in seconds! Just provide your email and password. Once logged in, you can track orders, manage wishlist, and access exclusive deals. Need help with account issues?";
    }
    // AI/Technology queries
    else if (message.includes('ai') || message.includes('forecast') || message.includes('smart') || message.includes('intelligent')) {
      response = "🤖 SmartShelf uses advanced AI technology (XGBoost & machine learning) to predict demand with 99.2% accuracy. This helps maintain optimal inventory levels and ensures products are always in stock. Pretty cool, right?";
    }
    // Contact queries
    else if (message.includes('contact') || message.includes('support') || message.includes('help') || message.includes('email') || message.includes('phone')) {
      response = "📞 Our support team is here to help!\n\n📧 Email: support@smartshelf.io\n☎️ Phone: +91 9876 543 210\n🕘 Hours: Mon-Fri, 9 AM - 6 PM IST\n📍 Tech Park, Building A, Floor 5, Bangalore\n\nYou can also chat directly with us here!";
    }
    // Greeting
    else if (message.includes('hi') || message.includes('hello') || message.includes('hey')) {
      response = "👋 Hey there! Welcome to SmartShelf. How can I assist you? Whether it's about products, shipping, payments, or becoming a vendor, I'm here to help!";
    }
    // Thank you
    else if (message.includes('thank') || message.includes('thanks') || message.includes('appreciate')) {
      response = "🙏 You're welcome! If you need any more help, feel free to ask. We're here 24/7 to assist you!";
    }
    // Security/Safety
    else if (message.includes('secure') || message.includes('safe') || message.includes('privacy') || message.includes('data')) {
      response = "🔒 We take security seriously! Our platform uses:\n\n• 🔐 SSL Encryption\n• ✅ PCI DSS Compliance\n• 🛡️ Advanced fraud detection\n• 🔑 Secure payment processing\n\nYour data is safe with us!";
    }
    // Default response
    else {
      const responses = [
        "That's a great question! I'm not 100% sure about that specific topic, but our support team can definitely help. Visit our Contact page or email us at support@smartshelf.io 📧",
        "Interesting! For detailed information on that, I'd recommend checking our FAQ section or reaching out to our support team at support@smartshelf.io 💬",
        "I didn't quite catch that. Could you rephrase your question? Or feel free to contact our team directly for detailed assistance! 🤔",
        "Great question! You might find the answer in our FAQ section. If not, our support team is just an email away at support@smartshelf.io 📚",
        "I'm here to help, but for that specific inquiry, I'd recommend contacting our expert support team. They can provide detailed guidance! 👨‍💼"
      ];
      response = responses[Math.floor(Math.random() * responses.length)];
    }

    this.addMessage(response);
  }

  updateBadge() {
    const badge = document.getElementById('chatbotBadge');
    if (this.unreadCount > 0) {
      badge.textContent = this.unreadCount > 9 ? '9+' : this.unreadCount;
      badge.style.display = 'flex';
      badge.classList.add('active');
    }
  }
}

// Initialize chatbot when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new SmartShelfChatbot();
    });
  } else {
    new SmartShelfChatbot();
  }
});

// Fallback for when script loads after DOM
if (document.readyState !== 'loading' && !window.chatbotInitialized) {
  window.chatbotInitialized = true;
  new SmartShelfChatbot();
}
