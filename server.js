import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import fetch from 'node-fetch';
import Razorpay from 'razorpay';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// ── OTP STORE (in-memory, for demo) ─────────────
const otpStore = new Map(); // email -> { otp, expires, context }
const resetTokens = new Map();

// Google OAuth config
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET';

// ── CONFIG ─────────────────────────────────────
const CFG = {
  JWT_SECRET: process.env.JWT_SECRET || 'smartshelf-secret-2025',
  EMAIL_USER: process.env.EMAIL_USER || 'your-email@gmail.com',
  EMAIL_PASS: process.env.EMAIL_PASS || 'your-app-password',
  EMAIL_FROM: process.env.EMAIL_FROM || '"SmartShelf" <your-email@gmail.com>',
  BASE_URL: process.env.BASE_URL || `http://localhost:${PORT}`,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || 'rzp_test_YOUR_TEST_KEY_ID',
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || 'YOUR_TEST_KEY_SECRET',
};

// ── RAZORPAY INSTANCE ───────────────────────────
const razorpay = new Razorpay({
  key_id: CFG.RAZORPAY_KEY_ID,
  key_secret: CFG.RAZORPAY_KEY_SECRET,
});

// ── MIDDLEWARE ──────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(cors());
app.use(express.static(__dirname));

// ── DB HELPERS ──────────────────────────────────
const DB = join(__dirname, 'db');
if (!fs.existsSync(DB)) fs.mkdirSync(DB);
function rdb(n) {
  try {
    return JSON.parse(fs.readFileSync(join(DB, `${n}.json`), 'utf8'));
  } catch {
    return ['carts', 'wishlist', 'notifications'].includes(n) ? {} : [];
  }
}
function wdb(n, d) {
  fs.writeFileSync(join(DB, `${n}.json`), JSON.stringify(d, null, 2));
}
function nextId(a) {
  return a.length ? Math.max(...a.map(x => x.id)) + 1 : 1;
}

// ── SEED ────────────────────────────────────────
if (!fs.existsSync(join(DB, 'users.json'))) {
  wdb('users', [{
    id: 1,
    name: 'Demo User',
    email: 'demo@smartshelf.com',
    password: bcrypt.hashSync('password123', 10),
    phone: '9876543210',
    role: 'Customer',
    joined: new Date().toISOString(),
    verified: true,
    loyaltyPoints: 500
  }]);
}

if (!fs.existsSync(join(DB, 'products.json'))) {
  wdb('products', [
    { id: 1, name: 'Wireless Headphones', price: 2499, mrp: 3999, disc: 38, category: 'Electronics', img: '🎧', rating: 4.5, reviews: 1250, stock: 50, brand: 'SoundCore', description: '40hr battery, ANC, Bluetooth 5.3, foldable design.' },
    { id: 2, name: 'USB-C Cable 3m', price: 299, mrp: 599, disc: 50, category: 'Accessories', img: '🔌', rating: 4.2, reviews: 5600, stock: 200, brand: 'TechCord', description: '100W power delivery, data sync 5Gbps.' },
    { id: 3, name: 'Portable SSD 1TB', price: 5499, mrp: 7999, disc: 31, category: 'Storage', img: '💾', rating: 4.8, reviews: 3200, stock: 35, brand: 'FlashSpeed', description: '550MB/s, USB 3.2, drop-proof 6ft.' },
    { id: 4, name: 'Wireless Mouse', price: 999, mrp: 1499, disc: 33, category: 'Accessories', img: '🖱️', rating: 4.4, reviews: 8900, stock: 150, brand: 'ClickPro', description: 'Silent clicks, 18mo battery, 2.4GHz.' },
    { id: 5, name: 'Monitor Light Bar', price: 8999, mrp: 12999, disc: 31, category: 'Lighting', img: '💡', rating: 4.6, reviews: 2100, stock: 40, brand: 'BrightAI', description: 'Auto brightness, USB-C powered, no shadow.' },
    { id: 6, name: 'Screen Protector', price: 399, mrp: 649, disc: 38, category: 'Electronics', img: '🔒', rating: 4.5, reviews: 1890, stock: 300, brand: 'ClearGuard', description: 'Tempered glass, oleophobic, bubble-free kit.' },
    { id: 7, name: 'Bluetooth Speaker 360°', price: 3499, mrp: 4999, disc: 30, category: 'Electronics', img: '🔊', rating: 4.4, reviews: 780, stock: 45, brand: 'SoundCore', description: 'IPX7 waterproof, 12hr play, deep bass.' },
    { id: 8, name: 'Laptop Sleeve 15"', price: 799, mrp: 1299, disc: 38, category: 'Accessories', img: '💼', rating: 4.6, reviews: 420, stock: 90, brand: 'CarryOn', description: 'Shockproof neoprene, scratch-resistant.' },
    { id: 9, name: 'Mechanical Keyboard TKL', price: 4999, mrp: 6999, disc: 29, category: 'Electronics', img: '⌨️', rating: 4.7, reviews: 1560, stock: 28, brand: 'TypeMaster', description: 'Cherry MX Blue, per-key RGB, PBT keys.' },
    { id: 10, name: 'Webcam 1080p AutoFocus', price: 2199, mrp: 3499, disc: 37, category: 'Electronics', img: '📷', rating: 4.3, reviews: 930, stock: 60, brand: 'ClearCam', description: '30fps, stereo mic, plug-and-play USB.' },
  ]);
}

['orders', 'contacts', 'newsletter'].forEach(n => {
  if (!fs.existsSync(join(DB, `${n}.json`))) wdb(n, []);
});
['carts', 'wishlist', 'notifications'].forEach(n => {
  if (!fs.existsSync(join(DB, `${n}.json`))) wdb(n, {});
});

// ── JWT MIDDLEWARE ──────────────────────────────
function auth(req, res, next) {
  const t = req.headers.authorization?.split(' ')[1];
  if (!t) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = jwt.verify(t, CFG.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── EMAIL HELPER ────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: CFG.EMAIL_USER,
    pass: CFG.EMAIL_PASS
  }
});

function wrap(title, body) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
    .w { background: white; max-width: 600px; margin: 0 auto; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .h { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .logo { font-size: 2em; font-weight: bold; margin-bottom: 10px; }
    .h h1 { font-size: 24px; margin: 0; }
    .b { padding: 30px; color: #333; line-height: 1.6; }
    .box { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center; font-size: 1.2rem; }
    .ft { background: #f9f9f9; padding: 15px; text-align: center; font-size: 12px; color: #777; border-top: 1px solid #eee; }
    a { color: #667eea; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="w">
    <div class="h">
      <div class="logo">🧠 SmartShelf</div>
      <h1>${title}</h1>
    </div>
    <div class="b">${body}</div>
    <div class="ft">© ${new Date().getFullYear()} SmartShelf Technologies</div>
  </div>
</body>
</html>`;
}

const sendMail = async (to, subject, html, text) => {
  const mailOptions = {
    from: CFG.EMAIL_FROM,
    to,
    subject,
    html: wrap(subject, html),
    text
  };
  return transporter.sendMail(mailOptions).then(() => {
    console.log(`📧 ${to} [${subject}]`);
    return true;
  }).catch((e) => {
    console.error('❌ Mail failed:', e.message);
    return false;
  });
};

// ── SEND OTP EMAIL ENDPOINT ───────────────────── ✅ FIXED ORDER
app.post('/api/auth/send-otp', async (req, res) => {
  const { email, context = 'login' } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Valid email required' });
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(email, { otp, expires: Date.now() + 10 * 60 * 1000, context });
  const sent = await sendMail(
    email,
    '🔐 Your SmartShelf OTP',
    `<p>Your OTP is:</p><div class="box" style="font-size:1.5rem;letter-spacing:6px;text-align:center"><b>${otp}</b></div><p>This code is valid for 10 minutes.</p>`,
    `Your SmartShelf OTP: ${otp}`
  );
  if (!sent) return res.status(500).json({ error: 'Failed to send OTP email' });
  res.json({ success: true });
});

// ── VERIFY OTP ENDPOINT ───────────────────────── ✅ FIXED
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const entry = otpStore.get(email);
  if (!entry || entry.otp !== otp)
    return res.status(400).json({ error: 'Invalid OTP' });
  if (entry.expires < Date.now()) {
    otpStore.delete(email);
    return res.status(400).json({ error: 'OTP expired' });
  }
  otpStore.delete(email);
  res.json({ success: true, context: entry.context });
});

// ── MICROSOFT OAUTH CALLBACK ──────────────────── ✅ FIXED
app.get('/auth/microsoft-callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID || 'YOUR_MICROSOFT_CLIENT_ID',
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || 'YOUR_MICROSOFT_CLIENT_SECRET',
        redirect_uri: CFG.BASE_URL + '/auth/microsoft-callback',
        grant_type: 'authorization_code',
        scope: 'openid email profile'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');
    const userRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const user = await userRes.json();
    res.send(`
      <html><head><title>Microsoft Login Success</title></head><body style="font-family:sans-serif;text-align:center;margin-top:80px;">
        <h2>Microsoft Login Successful!</h2>
        <p>Welcome, <b>${user.displayName || ''}</b></p>
        <p>Your email: <b>${user.mail || user.userPrincipalName || ''}</b></p>
        <a href="/">Go to Home</a>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Microsoft login failed: ' + e.message);
  }
});

// ── GOOGLE OAUTH CALLBACK ───────────────────────
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing authorization code');
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: CFG.BASE_URL + '/auth/callback',
        grant_type: 'authorization_code'
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token');
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const user = await userRes.json();
    res.send(`
      <html><head><title>Google Login Success</title></head><body style="font-family:sans-serif;text-align:center;margin-top:80px;">
        <h2>Google Login Successful!</h2>
        <p>Welcome, <b>${user.name || ''}</b></p>
        <p>Your email: <b>${user.email || ''}</b></p>
        <a href="/">Go to Home</a>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send('Google login failed: ' + e.message);
  }
});

// ── REGISTER ────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password required' });
    const users = rdb('users');
    if (users.find(u => u.email === email.toLowerCase().trim()))
      return res.status(400).json({ error: 'Email already registered' });
    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = {
      id: nextId(users),
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      phone: phone || '',
      role: 'Customer',
      joined: new Date().toISOString(),
      verified: false,
      loyaltyPoints: 0
    };
    users.push(newUser);
    wdb('users', users);
    const token = jwt.sign({ id: newUser.id, email: newUser.email }, CFG.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: newUser.id, name: newUser.name, email: newUser.email } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── LOGIN ────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const users = rdb('users');
  const user = users.find(u => u.email === email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(400).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: user.id, email: user.email }, CFG.JWT_SECRET, { expiresIn: '7d' });
  res.json({
    success: true, token, user: {
      id: user.id, name: user.name, email: user.email,
      role: user.role || 'Customer', verified: user.verified, loyaltyPoints: user.loyaltyPoints || 0
    }
  });
});

// ── GET PROFILE ──────────────────────────────────
app.get('/api/user/profile', auth, (req, res) => {
  const users = rdb('users');
  const user = users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, phone: user.phone, loyaltyPoints: user.loyaltyPoints } });
});

// ── GET ALL PRODUCTS ─────────────────────────────
app.get('/api/products', (req, res) => {
  const products = rdb('products');
  res.json({ success: true, data: products });
});

// ── GET PRODUCT BY ID ────────────────────────────
app.get('/api/products/:id', (req, res) => {
  const products = rdb('products');
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ success: true, data: product });
});

// ── ADD TO CART ──────────────────────────────────
app.post('/api/cart/add', auth, (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId || !quantity) return res.status(400).json({ error: 'Product ID and quantity required' });
    const carts = rdb('carts');
    const userId = req.user.id.toString();
    if (!carts[userId]) carts[userId] = [];
    const existing = carts[userId].find(item => item.productId === productId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      carts[userId].push({ productId, quantity, addedAt: new Date().toISOString() });
    }
    wdb('carts', carts);
    res.json({ success: true, message: 'Added to cart' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET CART ─────────────────────────────────────
app.get('/api/cart', auth, (req, res) => {
  try {
    const carts = rdb('carts');
    const userId = req.user.id.toString();
    const cart = carts[userId] || [];
    const products = rdb('products');
    const cartItems = cart.map(item => {
      const product = products.find(p => p.id === item.productId);
      return { ...item, product };
    });
    res.json({ success: true, cart: cartItems });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── REMOVE FROM CART ─────────────────────────────
app.post('/api/cart/remove', auth, (req, res) => {
  try {
    const { productId } = req.body;
    const carts = rdb('carts');
    const userId = req.user.id.toString();
    if (carts[userId]) {
      carts[userId] = carts[userId].filter(item => item.productId !== productId);
    }
    wdb('carts', carts);
    res.json({ success: true, message: 'Removed from cart' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CREATE ORDER ─────────────────────────────────
app.post('/api/orders/create', auth, (req, res) => {
  try {
    const { items, totalAmount } = req.body;
    if (!items || !totalAmount) return res.status(400).json({ error: 'Items and total amount required' });
    const orders = rdb('orders');
    const newOrder = {
      id: nextId(orders),
      userId: req.user.id,
      items: items,
      totalAmount: totalAmount,
      status: 'pending',
      razorpayOrderId: null,
      razorpayPaymentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    orders.push(newOrder);
    wdb('orders', orders);
    res.json({ success: true, orderId: newOrder.id, order: newOrder });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CREATE RAZORPAY ORDER ────────────────────────
app.post('/api/payment/create-order', auth, async (req, res) => {
  try {
    const { amount, orderId, description } = req.body;
    if (!amount || !orderId) return res.status(400).json({ error: 'Amount and order ID required' });
    
    const options = {
      amount: amount * 100, // Amount in paise
      currency: 'INR',
      receipt: `order_${orderId}_${Date.now()}`,
      description: description || `SmartShelf Order #${orderId}`,
      notes: {
        orderId: orderId,
        userId: req.user.id,
        email: req.user.email
      }
    };
    
    const razorpayOrder = await razorpay.orders.create(options);
    
    // Update order with razorpay order ID
    const orders = rdb('orders');
    const order = orders.find(o => o.id === orderId && o.userId === req.user.id);
    if (order) {
      order.razorpayOrderId = razorpayOrder.id;
      order.updatedAt = new Date().toISOString();
      wdb('orders', orders);
    }
    
    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      keyId: CFG.RAZORPAY_KEY_ID,
      amount: amount,
      orderId: orderId
    });
  } catch (e) {
    console.error('Razorpay order creation error:', e);
    res.status(500).json({ error: 'Failed to create payment order', details: e.message });
  }
});

// ── VERIFY PAYMENT ───────────────────────────────
app.post('/api/payment/verify', auth, async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;
    
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ error: 'Missing payment details' });
    }
    
    // Verify signature
    const hmac = crypto
      .createHmac('sha256', CFG.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    
    if (hmac !== razorpaySignature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }
    
    // Update order status
    const orders = rdb('orders');
    const order = orders.find(o => o.id === orderId && o.userId === req.user.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpayOrderId = razorpayOrderId;
    order.status = 'paid';
    order.updatedAt = new Date().toISOString();
    wdb('orders', orders);
    
    // Clear cart after successful payment
    const carts = rdb('carts');
    const userId = req.user.id.toString();
    carts[userId] = [];
    wdb('carts', carts);
    
    // Send confirmation email
    await sendMail(
      req.user.email,
      '✅ Payment Successful - Order Confirmed',
      `<p>Thank you for your payment!</p>
       <p><b>Order ID:</b> ${orderId}</p>
       <p><b>Amount:</b> ₹${order.totalAmount}</p>
       <p><b>Status:</b> Confirmed</p>
       <p>Your order will be shipped soon!</p>`,
      `Payment confirmed for order ${orderId}`
    );
    
    res.json({
      success: true,
      message: 'Payment verified successfully',
      order: {
        id: order.id,
        status: order.status,
        razorpayPaymentId: razorpayPaymentId
      }
    });
  } catch (e) {
    console.error('Payment verification error:', e);
    res.status(500).json({ error: 'Payment verification failed', details: e.message });
  }
});

// ── GET PAYMENT STATUS ───────────────────────────
app.get('/api/payment/status/:orderId', auth, async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const orders = rdb('orders');
    const order = orders.find(o => o.id === orderId && o.userId === req.user.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({
      success: true,
      order: {
        id: order.id,
        status: order.status,
        totalAmount: order.totalAmount,
        razorpayOrderId: order.razorpayOrderId,
        createdAt: order.createdAt
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET RAZORPAY KEY ─────────────────────────────
app.get('/api/payment/key', auth, (req, res) => {
  res.json({
    success: true,
    keyId: CFG.RAZORPAY_KEY_ID
  });
});

// ── GET ORDERS ───────────────────────────────────
app.get('/api/orders', auth, (req, res) => {
  try {
    const orders = rdb('orders');
    const userOrders = orders.filter(o => o.userId === req.user.id).map(o => ({
      id: o.id,
      totalAmount: o.totalAmount,
      status: o.status,
      items: o.items,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      razorpayPaymentId: o.razorpayPaymentId
    }));
    res.json({ success: true, orders: userOrders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── CONTACT FORM ─────────────────────────────────
app.post('/api/contacts', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'All fields required' });
    const contacts = rdb('contacts');
    contacts.push({ id: nextId(contacts), name, email, message, createdAt: new Date().toISOString() });
    wdb('contacts', contacts);
    res.json({ success: true, message: 'Message received' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── NEWSLETTER SIGNUP ────────────────────────────
app.post('/api/newsletter', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Valid email required' });
    const newsletter = rdb('newsletter');
    if (newsletter.find(n => n.email === email))
      return res.status(400).json({ error: 'Already subscribed' });
    newsletter.push({ id: nextId(newsletter), email, subscribedAt: new Date().toISOString() });
    wdb('newsletter', newsletter);
    res.json({ success: true, message: 'Subscribed to newsletter' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── KAGGLE INTEGRATION ───────────────────────────
// Endpoint to fetch Kaggle data and convert to JSON
app.post('/api/kaggle/fetch-data', async (req, res) => {
  try {
    const execPromise = promisify(exec);
    console.log('📥 Fetching Kaggle fashion dataset...');
    
    const { stdout, stderr } = await execPromise('python fetch_kaggle_data.py');
    
    if (stderr) console.warn('⚠️  Python warnings:', stderr);
    console.log('✅ Kaggle data fetched:', stdout);
    
    res.json({ 
      success: true, 
      message: 'Kaggle data fetched successfully',
      output: stdout
    });
  } catch (error) {
    console.error('❌ Kaggle fetch error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch Kaggle data',
      details: error.message,
      hint: 'Make sure Python 3 and dependencies (pip install kagglehub pandas) are installed'
    });
  }
});

// Endpoint to import Kaggle data into products database
app.post('/api/kaggle/import-products', async (req, res) => {
  try {
    const dataPath = join(__dirname, 'kaggle_fashion_data.json');
    
    // Check if Kaggle data file exists
    if (!fs.existsSync(dataPath)) {
      return res.status(400).json({ 
        error: 'Kaggle data not found',
        hint: 'Run /api/kaggle/fetch-data first'
      });
    }
    
    // Read Kaggle data
    const kaggleData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(`📊 Kaggle data loaded: ${kaggleData.length} items`);
    
    // Read existing products
    let products = rdb('products');
    const existingCount = products.length;
    
    // Format and merge Kaggle data
    const formattedData = kaggleData.map((item, index) => {
      const price = parseInt(item.price) || 1999;
      const mrp = parseInt(item.mrp) || Math.round(price * 1.5);
      const discount = item.discount || Math.round(((mrp - price) / mrp) * 100);
      
      return {
        id: existingCount + index + 1,
        name: item.name || item.title || `Fashion Item ${index + 1}`,
        brand: item.brand || 'Fashion Brand',
        category: item.category || item.type || 'Fashion',
        price: price,
        mrp: mrp,
        disc: Math.min(discount, 99),
        rating: parseFloat(item.rating) || 4.5,
        reviews: parseInt(item.reviews) || Math.floor(Math.random() * 5000) + 100,
        stock: parseInt(item.stock) || Math.floor(Math.random() * 100) + 10,
        description: item.description || `Beautiful fashion item from Kaggle dataset. Category: ${item.category || 'Fashion'}`,
        img: item.emoji || '👕',
        imgUrl: item.image_url || item.img_url || `https://via.placeholder.com/320x320?text=${encodeURIComponent(item.name || 'Product')}`,
        badge: 'Kaggle',
        dataSource: 'kaggle'
      };
    });
    
    // Merge products
    const updatedProducts = [...products, ...formattedData];
    wdb('products', updatedProducts);
    
    console.log(`✅ Imported ${formattedData.length} fashion items from Kaggle`);
    
    res.json({ 
      success: true,
      message: `Successfully imported ${formattedData.length} Kaggle products`,
      stats: {
        totalProducts: updatedProducts.length,
        newProducts: formattedData.length,
        previousCount: existingCount,
        dataSource: 'kaggle'
      }
    });
  } catch (error) {
    console.error('❌ Import error:', error.message);
    res.status(500).json({ 
      error: 'Failed to import Kaggle products',
      details: error.message
    });
  }
});

// Endpoint to view import stats
app.get('/api/kaggle/stats', (req, res) => {
  try {
    const products = rdb('products');
    const kaggleProducts = products.filter(p => p.dataSource === 'kaggle');
    
    res.json({
      totalProducts: products.length,
      kaggleProducts: kaggleProducts.length,
      percentage: products.length > 0 ? Math.round((kaggleProducts.length / products.length) * 100) : 0,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to remove all Kaggle products
app.post('/api/kaggle/clear', (req, res) => {
  try {
    let products = rdb('products');
    const originalCount = products.length;
    products = products.filter(p => p.dataSource !== 'kaggle');
    const removedCount = originalCount - products.length;
    
    wdb('products', products);
    
    res.json({
      success: true,
      message: `Removed ${removedCount} Kaggle products`,
      remainingProducts: products.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── FILE DOWNLOADS MANAGEMENT ───────────────────
const DOWNLOADS_DIR = join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR);

// Endpoint to save HTML file (receipt, invoice, etc.) on backend
app.post('/api/save-file', auth, (req, res) => {
  try {
    const { fileName, htmlContent, fileType = 'receipt' } = req.body;
    
    if (!fileName || !htmlContent) {
      return res.status(400).json({ error: 'fileName and htmlContent required' });
    }
    
    // Sanitize filename
    const safeFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const subDir = join(DOWNLOADS_DIR, fileType);
    
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
    
    const filePath = join(subDir, `${safeFileName}.html`);
    fs.writeFileSync(filePath, htmlContent, 'utf8');
    
    console.log(`✅ File saved: ${filePath}`);
    
    res.json({
      success: true,
      message: 'File saved successfully',
      fileId: safeFileName,
      downloadUrl: `/api/download-file/${fileType}/${safeFileName}`,
      size: htmlContent.length
    });
  } catch (error) {
    console.error('❌ Save file error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to download saved file
app.get('/api/download-file/:fileType/:fileId', (req, res) => {
  try {
    const { fileType, fileId } = req.params;
    const filePath = join(DOWNLOADS_DIR, fileType, `${fileId}.html`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    res.download(filePath);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to list saved files
app.get('/api/saved-files/:fileType', auth, (req, res) => {
  try {
    const { fileType } = req.params;
    const subDir = join(DOWNLOADS_DIR, fileType);
    
    if (!fs.existsSync(subDir)) {
      return res.json({ success: true, files: [] });
    }
    
    const files = fs.readdirSync(subDir).map(file => {
      const filePath = join(subDir, file);
      const stats = fs.statSync(filePath);
      return {
        id: file.replace('.html', ''),
        name: file,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        downloadUrl: `/api/download-file/${fileType}/${file.replace('.html', '')}`
      };
    });
    
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to delete saved file
app.post('/api/delete-file/:fileType/:fileId', auth, (req, res) => {
  try {
    const { fileType, fileId } = req.params;
    const filePath = join(DOWNLOADS_DIR, fileType, `${fileId}.html`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    fs.unlinkSync(filePath);
    
    res.json({ success: true, message: 'File deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── START SERVER ────────────────────────────────
app.listen(PORT, () => console.log(`
╔══════════════════════════════════════════╗
║   🧠 SmartShelf Backend  v3.0            ║
╠══════════════════════════════════════════╣
║  🚀  http://localhost:${PORT}             ║
║  📧  ${CFG.EMAIL_USER.slice(0, 32).padEnd(32)}║
╠══════════════════════════════════════════╣
║  ✅ OTP, OAuth, All routes OK!           ║
╚══════════════════════════════════════════╝`));
