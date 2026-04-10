// ════════════════════════════════════════════════════════
//  SmartShelf Vendor Backend  —  server.js
//  Stack: Node.js · Express · MySQL2
//  Run:   npm install && node server.js
//  Port:  5000
// ════════════════════════════════════════════════════════

require('dotenv').config();
const express    = require('express');
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');

const app  = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'smartshelf_vendor_secret_2025';

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('.'));          // serves vendor.html directly

// ── DB POOL ──────────────────────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'smartshelf_vendor',
  waitForConnections: true,
  connectionLimit: 10,
});

// ── AUTO-SETUP DATABASE ──────────────────────────────────
async function setupDatabase() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        name        VARCHAR(150)        NOT NULL,
        email       VARCHAR(200) UNIQUE NOT NULL,
        password    VARCHAR(255)        NOT NULL,
        phone       VARCHAR(20),
        gst_number  VARCHAR(50),
        bank_account VARCHAR(30),
        store_name  VARCHAR(150),
        rating      DECIMAL(2,1) DEFAULT 4.7,
        is_active   TINYINT(1)   DEFAULT 1,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id   INT          NOT NULL,
        name        VARCHAR(255) NOT NULL,
        sku         VARCHAR(100) UNIQUE,
        price       DECIMAL(12,2) NOT NULL,
        mrp         DECIMAL(12,2),
        category    VARCHAR(100),
        brand       VARCHAR(100),
        stock       INT DEFAULT 0,
        description TEXT,
        img_url     VARCHAR(500),
        is_active   TINYINT(1) DEFAULT 1,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id   INT          NOT NULL,
        order_ref   VARCHAR(50)  UNIQUE NOT NULL,
        customer_name VARCHAR(150),
        customer_city VARCHAR(100),
        amount      DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(50),
        status      ENUM('pending','processing','shipped','delivered','cancelled') DEFAULT 'pending',
        items_desc  TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS stock_log (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        product_id  INT NOT NULL,
        vendor_id   INT NOT NULL,
        qty_added   INT NOT NULL,
        note        VARCHAR(255),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS promotions (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id   INT NOT NULL,
        name        VARCHAR(200) NOT NULL,
        discount    INT NOT NULL,
        duration_hrs INT DEFAULT 48,
        category    VARCHAR(100) DEFAULT 'All Categories',
        status      ENUM('active','paused','expired') DEFAULT 'active',
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS payout_requests (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        vendor_id   INT NOT NULL,
        amount      DECIMAL(12,2) NOT NULL,
        status      ENUM('pending','processing','completed','rejected') DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    // Seed demo vendor
    const [rows] = await conn.query('SELECT id FROM vendors WHERE email = ?', ['vendor@smartshelf.com']);
    if (rows.length === 0) {
      const hash = await bcrypt.hash('vendor123', 10);
      const [res] = await conn.query(
        'INSERT INTO vendors (name,email,password,store_name,phone) VALUES (?,?,?,?,?)',
        ['SmartShelf Vendor','vendor@smartshelf.com', hash,'My Store','+91 98765 43210']
      );
      const vid = res.insertId;
      // Seed demo products
      const prods = [
        [vid,'iPhone 16 Pro','SKU-001',134999,149999,'Mobiles','Apple',8,'A18 chip, 48MP camera, titanium','https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=40&h=40&fit=crop'],
        [vid,'MacBook Air M3','SKU-002',114900,134900,'Laptops','Apple',15,'M3 chip, 8GB RAM, 256GB SSD','https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=40&h=40&fit=crop'],
        [vid,'Sony WH-1000XM5','SKU-003',24990,34990,'Audio','Sony',56,'Industry-leading ANC, 30hr battery','https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=40&h=40&fit=crop'],
        [vid,'boAt Airdopes 141','SKU-004',999,2990,'Audio','boAt',342,'42hr battery, IPX4, BT 5.3','https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=40&h=40&fit=crop'],
        [vid,'Lenovo IdeaPad Slim 5','SKU-005',55990,74999,'Laptops','Lenovo',23,'Ryzen 7, 16GB, 512GB SSD','https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=40&h=40&fit=crop'],
        [vid,'Xiaomi Watch Pro','SKU-006',12999,19999,'Wearables','Xiaomi',5,'AMOLED, SpO2, 12-day battery','https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=40&h=40&fit=crop'],
      ];
      for (const p of prods) {
        await conn.query('INSERT INTO products (vendor_id,name,sku,price,mrp,category,brand,stock,description,img_url) VALUES (?,?,?,?,?,?,?,?,?,?)', p);
      }
      // Seed demo orders
      const orders = [
        [vid,'#ORD-12458','Rajesh Kumar','Mumbai',5420,'UPI','shipped','Sony WH-1000XM5 ×1'],
        [vid,'#ORD-12457','Priya Sharma','Delhi',8950,'Credit Card','processing','Apple AirPods Pro ×1'],
        [vid,'#ORD-12456','Amit Verma','Bangalore',12300,'Net Banking','delivered','iPhone 16 ×1'],
        [vid,'#ORD-12455','Sneha Patel','Ahmedabad',3200,'UPI','shipped','boAt Airdopes ×2'],
        [vid,'#ORD-12454','Vikram Nair','Chennai',18750,'EMI','delivered','MacBook Air ×1'],
      ];
      for (const o of orders) {
        await conn.query('INSERT INTO orders (vendor_id,order_ref,customer_name,customer_city,amount,payment_method,status,items_desc) VALUES (?,?,?,?,?,?,?,?)', o);
      }
    }
    console.log('✅ Database ready');
  } finally {
    conn.release();
  }
}

// ── MIDDLEWARE: auth ──────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    req.vendor = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── ROUTES ───────────────────────────────────────────────
const r = express.Router();

// Health
r.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// ── AUTH ──
r.post('/auth/register', async (req, res) => {
  const { name, email, password, store_name, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO vendors (name,email,password,store_name,phone) VALUES (?,?,?,?,?)',
      [name, email, hash, store_name||name, phone||'']
    );
    const token = jwt.sign({ id: result.insertId, email, name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, vendor: { id: result.insertId, name, email, store_name } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

r.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const [rows] = await pool.query('SELECT * FROM vendors WHERE email = ? AND is_active = 1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    const vendor = rows[0];
    const match = await bcrypt.compare(password, vendor.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: vendor.id, email: vendor.email, name: vendor.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, vendor: { id: vendor.id, name: vendor.name, email: vendor.email, store_name: vendor.store_name } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ANALYTICS ──
r.get('/analytics/summary', auth, async (req, res) => {
  try {
    const vid = req.vendor.id;
    const [[pCount]] = await pool.query('SELECT COUNT(*) AS c FROM products WHERE vendor_id = ? AND is_active = 1', [vid]);
    const [[oCount]] = await pool.query('SELECT COUNT(*) AS c FROM orders WHERE vendor_id = ?', [vid]);
    const [[rev]]    = await pool.query("SELECT SUM(amount) AS total FROM orders WHERE vendor_id = ? AND status = 'delivered'", [vid]);
    const [[low]]    = await pool.query('SELECT COUNT(*) AS c FROM products WHERE vendor_id = ? AND stock <= 20 AND is_active = 1', [vid]);
    res.json({
      totalProducts: pCount.c,
      totalOrders:   oCount.c,
      totalRevenue:  rev.total || 0,
      lowStockCount: low.c,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PRODUCTS ──
r.get('/products', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM products WHERE vendor_id = ? AND is_active = 1 ORDER BY created_at DESC',
      [req.vendor.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/products', auth, async (req, res) => {
  const { name, price, mrp, category, brand, stock, sku, description, img_url } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'name and price required' });
  try {
    const [result] = await pool.query(
      'INSERT INTO products (vendor_id,name,price,mrp,category,brand,stock,sku,description,img_url) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [req.vendor.id, name, price, mrp||price, category||'', brand||'', stock||0, sku||'SKU-'+Date.now(), description||'', img_url||'']
    );
    res.status(201).json({ id: result.insertId, message: 'Product created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/products/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ? AND vendor_id = ?', [req.params.id, req.vendor.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.put('/products/:id', auth, async (req, res) => {
  const { name, price, mrp, category, stock, description } = req.body;
  try {
    await pool.query(
      'UPDATE products SET name=?,price=?,mrp=?,category=?,stock=?,description=?,updated_at=NOW() WHERE id=? AND vendor_id=?',
      [name, price, mrp, category, stock, description, req.params.id, req.vendor.id]
    );
    res.json({ message: 'Updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.delete('/products/:id', auth, async (req, res) => {
  try {
    await pool.query('UPDATE products SET is_active=0 WHERE id=? AND vendor_id=?', [req.params.id, req.vendor.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/products/:id/price', auth, async (req, res) => {
  const { price } = req.body;
  try {
    await pool.query('UPDATE products SET price=?,updated_at=NOW() WHERE id=? AND vendor_id=?', [price, req.params.id, req.vendor.id]);
    res.json({ message: 'Price updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/products/:id/restock', auth, async (req, res) => {
  const { qty, note } = req.body;
  if (!qty || qty <= 0) return res.status(400).json({ error: 'Invalid qty' });
  try {
    await pool.query('UPDATE products SET stock = stock + ?, updated_at=NOW() WHERE id=? AND vendor_id=?', [qty, req.params.id, req.vendor.id]);
    await pool.query('INSERT INTO stock_log (product_id,vendor_id,qty_added,note) VALUES (?,?,?,?)', [req.params.id, req.vendor.id, qty, note||'']);
    res.json({ message: 'Restocked' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ORDERS ──
r.get('/orders', auth, async (req, res) => {
  const { status, limit = 50 } = req.query;
  try {
    let q = 'SELECT * FROM orders WHERE vendor_id = ?';
    const params = [req.vendor.id];
    if (status) { q += ' AND status = ?'; params.push(status); }
    q += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    const [rows] = await pool.query(q, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/orders/:ref', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE order_ref=? AND vendor_id=?', [req.params.ref, req.vendor.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/orders/update-status', auth, async (req, res) => {
  const { orderId, status } = req.body;
  const valid = ['pending','processing','shipped','delivered','cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    await pool.query('UPDATE orders SET status=?,updated_at=NOW() WHERE order_ref=? AND vendor_id=?', [status, orderId, req.vendor.id]);
    res.json({ message: 'Status updated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PROMOTIONS ──
r.post('/promotions/activate', auth, async (req, res) => {
  const { name } = req.body;
  try {
    await pool.query('INSERT INTO promotions (vendor_id,name,discount) VALUES (?,?,?)', [req.vendor.id, name, 10]);
    res.json({ message: 'Activated' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.post('/promotions/create', auth, async (req, res) => {
  const { name, discount, duration, category } = req.body;
  if (!name || !discount) return res.status(400).json({ error: 'Missing fields' });
  try {
    const [result] = await pool.query(
      'INSERT INTO promotions (vendor_id,name,discount,duration_hrs,category) VALUES (?,?,?,?,?)',
      [req.vendor.id, name, discount, duration||48, category||'All Categories']
    );
    res.status(201).json({ id: result.insertId, message: 'Campaign created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/promotions', auth, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM promotions WHERE vendor_id=? AND status='active' ORDER BY created_at DESC", [req.vendor.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PAYOUT ──
r.post('/payout/request', auth, async (req, res) => {
  const { amount } = req.body;
  try {
    await pool.query('INSERT INTO payout_requests (vendor_id,amount) VALUES (?,?)', [req.vendor.id, amount||0]);
    res.json({ message: 'Payout request submitted' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/payout/history', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payout_requests WHERE vendor_id=? ORDER BY requested_at DESC', [req.vendor.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SETTINGS ──
r.put('/settings/update', auth, async (req, res) => {
  const { name, email, phone, gst, bank } = req.body;
  try {
    await pool.query(
      'UPDATE vendors SET name=?,phone=?,gst_number=?,bank_account=? WHERE id=?',
      [name, phone, gst, bank, req.vendor.id]
    );
    res.json({ message: 'Settings saved' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

r.get('/profile', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id,name,email,phone,gst_number,bank_account,store_name,rating,created_at FROM vendors WHERE id=?', [req.vendor.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── STOCK LOG ──
r.get('/stock-log', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sl.*, p.name AS product_name
       FROM stock_log sl JOIN products p ON sl.product_id = p.id
       WHERE sl.vendor_id = ? ORDER BY sl.created_at DESC LIMIT 50`,
      [req.vendor.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/api/vendor', r);

// ── START ─────────────────────────────────────────────────
setupDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀  SmartShelf Vendor Backend running on http://localhost:${PORT}`);
      console.log(`📊  Dashboard  →  http://localhost:${PORT}/vendor.html`);
      console.log(`🔑  Demo login →  vendor@smartshelf.com  /  vendor123`);
      console.log(`\nAPI Endpoints:`);
      console.log(`  POST /api/vendor/auth/register`);
      console.log(`  POST /api/vendor/auth/login`);
      console.log(`  GET  /api/vendor/analytics/summary   [auth]`);
      console.log(`  GET  /api/vendor/products             [auth]`);
      console.log(`  POST /api/vendor/products             [auth]`);
      console.log(`  PUT  /api/vendor/products/:id         [auth]`);
      console.log(`  DEL  /api/vendor/products/:id         [auth]`);
      console.log(`  POST /api/vendor/products/:id/restock [auth]`);
      console.log(`  GET  /api/vendor/orders               [auth]`);
      console.log(`  POST /api/vendor/orders/update-status [auth]`);
      console.log(`  POST /api/vendor/promotions/create    [auth]`);
      console.log(`  POST /api/vendor/payout/request       [auth]`);
      console.log(`  PUT  /api/vendor/settings/update      [auth]`);
    });
  })
  .catch(err => {
    console.error('❌ DB setup failed:', err.message);
    console.error('   Make sure MySQL is running and update .env with your credentials');
    // Start anyway so vendor.html is served
    app.listen(PORT, () => console.log(`⚡ Server running (no DB) on port ${PORT}`));
  });
