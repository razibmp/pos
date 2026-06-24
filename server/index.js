const express  = require("express");
const cors     = require("cors");
const mysql    = require("mysql2/promise");
const bcrypt   = require("bcryptjs");
const path     = require("path");
const Pathao   = require("./pathao");
const WC       = require("./woocommerce");
const nodemailer = require("nodemailer");
const cron       = require("node-cron");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Serve public order form
app.get("/order", (req, res) => {
  res.sendFile(path.join(__dirname, "order-form.html"));
});

// ── DB POOL ──────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host    : process.env.DB_HOST     || "localhost",
  port    : process.env.DB_PORT     || 3306,
  database: process.env.DB_NAME     || "hobbycenter",
  user    : process.env.DB_USER     || "hcuser",
  password: process.env.DB_PASSWORD || "hcpass2024",
  waitForConnections: true,
  connectionLimit   : 10,
});

const q = (sql, params=[]) => pool.execute(sql, params);

// ── INIT DB ──────────────────────────────────────────────────────────────────
async function initDB() {
  await q(`CREATE TABLE IF NOT EXISTS users (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    username   VARCHAR(60) UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    name       VARCHAR(100) NOT NULL,
    role       VARCHAR(30) NOT NULL DEFAULT 'Staff',
    emoji      VARCHAR(10) DEFAULT '🧑‍🔧',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS categories (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    name  VARCHAR(100) UNIQUE NOT NULL,
    emoji VARCHAR(10) DEFAULT '🏷️'
  )`);

  await q(`CREATE TABLE IF NOT EXISTS products (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    cat        VARCHAR(100) NOT NULL,
    buy        DECIMAL(12,2) NOT NULL DEFAULT 0,
    sell       DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock      INT NOT NULL DEFAULT 0,
    low        INT NOT NULL DEFAULT 5,
    emoji      VARCHAR(10) DEFAULT '🧸',
    brand      VARCHAR(100) DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS sales (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    inv          VARCHAR(30) NOT NULL,
    date         DATE NOT NULL,
    time         VARCHAR(20) NOT NULL,
    product_id   INT,
    product_name VARCHAR(200) NOT NULL,
    emoji        VARCHAR(10) DEFAULT '🧸',
    qty          INT NOT NULL,
    price        DECIMAL(12,2) NOT NULL,
    buy_price    DECIMAL(12,2) NOT NULL DEFAULT 0,
    total        DECIMAL(12,2) NOT NULL,
    profit       DECIMAL(12,2) NOT NULL DEFAULT 0,
    customer     VARCHAR(200) DEFAULT 'Walk-in',
    phone        VARCHAR(50) DEFAULT '',
    address      TEXT,
    payment      VARCHAR(50) DEFAULT 'Cash',
    sold_by      VARCHAR(100) DEFAULT '',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);


  await q(`CREATE TABLE IF NOT EXISTS pending_orders (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    inv             VARCHAR(30) NOT NULL,
    customer_name   VARCHAR(200),
    customer_phone  VARCHAR(50),
    customer_address TEXT,
    product_details TEXT,
    product_price   DECIMAL(12,2) DEFAULT 0,
    delivery_type   VARCHAR(20) DEFAULT 'inside',
    delivery_charge DECIMAL(12,2) DEFAULT 80,
    total           DECIMAL(12,2) DEFAULT 0,
    notes           TEXT,
    status          VARCHAR(30) DEFAULT 'pending',
    sale_id         INT,
    delivery_id     INT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add phone and address columns if not exist
  try { await q("ALTER TABLE sales ADD COLUMN phone VARCHAR(50) DEFAULT ''"); } catch(e) {}
  try { await q("ALTER TABLE sales ADD COLUMN address TEXT"); } catch(e) {}
  try { await q("ALTER TABLE pending_orders ADD COLUMN product_id INT DEFAULT NULL"); } catch(e) {}
  try { await q("ALTER TABLE pending_orders ADD COLUMN qty INT DEFAULT 1"); } catch(e) {}
  try { await q("ALTER TABLE pending_orders ADD COLUMN source VARCHAR(30) DEFAULT 'form'"); } catch(e) {}
  try { await q("ALTER TABLE pending_orders ADD COLUMN wc_order_id INT DEFAULT NULL"); } catch(e) {}
  try { await q("ALTER TABLE pending_orders ADD COLUMN wc_items TEXT DEFAULT NULL"); } catch(e) {}

  await q(`CREATE TABLE IF NOT EXISTS expenses (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(200) NOT NULL,
    cat        VARCHAR(50) NOT NULL DEFAULT 'misc',
    amount     DECIMAL(12,2) NOT NULL,
    date       DATE NOT NULL,
    notes      TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS purchases (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    supplier_name       VARCHAR(200) NOT NULL,
    order_date          DATE NOT NULL,
    status              VARCHAR(30) NOT NULL DEFAULT 'pending',
    product_cost_bdt    DECIMAL(12,2) DEFAULT 0,
    china_shipping_bdt  DECIMAL(12,2) DEFAULT 0,
    cnf_bdt             DECIMAL(12,2) DEFAULT 0,
    customs_duty_bdt    DECIMAL(12,2) DEFAULT 0,
    vat_bdt             DECIMAL(12,2) DEFAULT 0,
    agent_fees_bdt      DECIMAL(12,2) DEFAULT 0,
    local_transport_bdt DECIMAL(12,2) DEFAULT 0,
    other_bdt           DECIMAL(12,2) DEFAULT 0,
    total_landed        DECIMAL(12,2) DEFAULT 0,
    total_qty           INT DEFAULT 0,
    cost_per_unit       DECIMAL(12,2) DEFAULT 0,
    notes               TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS purchase_items (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    product_id  INT,
    qty         INT NOT NULL DEFAULT 0,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
  )`);

  await q(`CREATE TABLE IF NOT EXISTS stakeholders (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    emoji      VARCHAR(10) DEFAULT '👤',
    share_pct  DECIMAL(5,2) NOT NULL DEFAULT 0,
    note       TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS stakeholder_transactions (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    stakeholder_id INT NOT NULL,
    type           VARCHAR(30) NOT NULL,
    amount         DECIMAL(12,2) NOT NULL,
    date           DATE NOT NULL,
    note           TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (stakeholder_id) REFERENCES stakeholders(id) ON DELETE CASCADE
  )`);

  // Seed users
  const [[{cnt:uc}]] = await q("SELECT COUNT(*) as cnt FROM users");
  if (uc === 0) {
    const hash = bcrypt.hashSync("1234", 10);
    const ins = "INSERT INTO users (username,password,name,role,emoji) VALUES (?,?,?,?,?)";
    await q(ins, ["razib", hash, "Razib", "Owner",   "👑"]);
    await q(ins, ["fahad", hash, "Fahad", "Manager", "🧑‍💼"]);
    await q(ins, ["manik", hash, "Manik", "Staff",   "🧑‍🔧"]);
    await q(ins, ["babu",  hash, "Babu",  "Staff",   "🧑‍🔧"]);
    console.log("✅ Users seeded");
  }

  // Seed categories
  const [[{cnt:cc}]] = await q("SELECT COUNT(*) as cnt FROM categories");
  if (cc === 0) {
    const cats = [
      ["Building Blocks","🧱"],["Action Figures","🤖"],["Board Games","🎲"],
      ["Remote Control","🚗"],["Puzzles","🧩"],["Dolls & Accessories","👗"],
      ["Educational Toys","📚"],["Outdoor Toys","🌳"],["Arts & Crafts","🎨"],
      ["Model Kits","🔩"],["F1 1:18 Scale","🏎️"],["F1 1:32 Scale","🏎️"],
      ["F1 1:43 Scale","🏎️"],["F1 1:64 Scale","🏎️"],["Scale Figure","🗿"],
      ["Diorama","🏔️"],["Wall Mount Poster","🖼️"],["Jersey","👕"],["Other","🏷️"]
    ];
    for (const [n, e] of cats) await q("INSERT INTO categories (name,emoji) VALUES (?,?)", [n, e]);
    console.log("✅ Categories seeded");
  }

  // Seed stakeholders
  const [[{cnt:sc}]] = await q("SELECT COUNT(*) as cnt FROM stakeholders");
  if (sc === 0) {
    const ins = "INSERT INTO stakeholders (name,emoji,share_pct,note) VALUES (?,?,?,?)";
    await q(ins, ["Razib","👑",40,"Founder"]);
    await q(ins, ["Babu","🤝",30,"Partner"]);
    await q(ins, ["Fahad","🧑‍💼",30,"Partner"]);
    console.log("✅ Stakeholders seeded");
  }


  await q(`CREATE TABLE IF NOT EXISTS deliveries (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    sale_id           INT,
    consignment_id    VARCHAR(100),
    merchant_order_id VARCHAR(100),
    recipient_name    VARCHAR(200) NOT NULL,
    recipient_phone   VARCHAR(20) NOT NULL,
    recipient_address TEXT NOT NULL,
    amount_to_collect DECIMAL(12,2) DEFAULT 0,
    item_description  VARCHAR(200),
    item_quantity     INT DEFAULT 1,
    item_weight       DECIMAL(5,2) DEFAULT 0.5,
    note              TEXT,
    delivery_type     VARCHAR(20) DEFAULT 'inside',
    delivery_charge   DECIMAL(12,2) DEFAULT 80,
    status            VARCHAR(50) DEFAULT 'pending',
    pathao_status     VARCHAR(100),
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);


  await q(`CREATE TABLE IF NOT EXISTS pathao_payouts (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    payout_ref    VARCHAR(100),
    amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
    date          DATE NOT NULL,
    note          TEXT,
    status        VARCHAR(30) DEFAULT 'pending',
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS payout_deliveries (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    payout_id   INT NOT NULL,
    delivery_id INT NOT NULL,
    FOREIGN KEY (payout_id) REFERENCES pathao_payouts(id) ON DELETE CASCADE
  )`);

  await q(`CREATE TABLE IF NOT EXISTS stock_history (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    product_id  INT NOT NULL,
    product_name VARCHAR(200),
    change_qty  INT NOT NULL,
    old_stock   INT NOT NULL,
    new_stock   INT NOT NULL,
    reason      VARCHAR(100) NOT NULL,
    ref         VARCHAR(100),
    changed_by  VARCHAR(100),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);


  await q(`CREATE TABLE IF NOT EXISTS wc_product_map (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    mgt_product_id INT NOT NULL,
    wc_product_id  INT NOT NULL,
    wc_sku         VARCHAR(100),
    wc_name        VARCHAR(200),
    last_sync      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_mgt (mgt_product_id),
    UNIQUE KEY unique_wc  (wc_product_id)
  )`);

  await q(`CREATE TABLE IF NOT EXISTS wc_orders (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    wc_order_id    INT UNIQUE NOT NULL,
    mgt_sale_id    INT,
    delivery_id    INT,
    status         VARCHAR(50),
    customer_name  VARCHAR(200),
    customer_phone VARCHAR(30),
    customer_address TEXT,
    total          DECIMAL(12,2),
    payment_method VARCHAR(50),
    items          TEXT,
    synced_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await q(`CREATE TABLE IF NOT EXISTS wc_sync_log (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    type       VARCHAR(50),
    status     VARCHAR(20),
    message    TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);


  await q(`CREATE TABLE IF NOT EXISTS preorders (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    sheet_row       INT,
    timestamp       VARCHAR(200),
    email           VARCHAR(300),
    customer_name   VARCHAR(300),
    comments        TEXT,
    delivery_agreed VARCHAR(200),
    address         TEXT,
    phone           VARCHAR(50),
    paid_amount     DECIMAL(12,2) DEFAULT 0,
    product_price   DECIMAL(12,2) DEFAULT 0,
    month           VARCHAR(50),
    status          VARCHAR(50) DEFAULT 'pending',
    delivery_id     INT,
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Alter existing table if columns are too small
  try {
    await q("ALTER TABLE preorders MODIFY customer_name VARCHAR(300)");
    await q("ALTER TABLE preorders MODIFY email VARCHAR(300)");
    await q("ALTER TABLE preorders MODIFY delivery_agreed VARCHAR(200)");
    await q("ALTER TABLE preorders MODIFY phone VARCHAR(50)");
    await q("ALTER TABLE preorders MODIFY month VARCHAR(50)");
    await q("ALTER TABLE preorders MODIFY status VARCHAR(50)");
    await q("ALTER TABLE preorders MODIFY timestamp VARCHAR(200)");
    await q("ALTER TABLE preorders ADD COLUMN IF NOT EXISTS courier DECIMAL(12,2) DEFAULT 0");
    await q("ALTER TABLE preorders ADD COLUMN IF NOT EXISTS final_price DECIMAL(12,2) DEFAULT 0");
    await q("ALTER TABLE preorders ADD COLUMN IF NOT EXISTS due DECIMAL(12,2) DEFAULT 0");
  } catch(e) { /* columns may already exist */ }

  console.log("✅ Database ready");
}


// ── STOCK HISTORY HELPER ──────────────────────────────────────────────────────
async function logStockChange(product_id, change_qty, reason, ref="", changed_by="") {
  try {
    const [[prod]] = await q("SELECT name, stock FROM products WHERE id=?", [product_id]);
    if (!prod) return;
    const old_stock = +prod.stock;
    const new_stock = old_stock + change_qty;
    await q(
      "INSERT INTO stock_history (product_id,product_name,change_qty,old_stock,new_stock,reason,ref,changed_by) VALUES (?,?,?,?,?,?,?,?)",
      [product_id, prod.name, change_qty, old_stock, new_stock, reason, ref, changed_by]
    );
  } catch(e) { console.error("Stock log error:", e.message); }
}

// ── AUTH ─────────────────────────────────────────────────────────────────────
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const [[user]] = await q("SELECT * FROM users WHERE username = ?", [username?.toLowerCase()?.trim()]);
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: "Invalid username or password" });
    res.json({ id: user.id, username: user.username, name: user.name, role: user.role, emoji: user.emoji });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── USERS ────────────────────────────────────────────────────────────────────
app.get("/api/users", async (_, res) => {
  const [rows] = await q("SELECT id,username,name,role,emoji,created_at FROM users ORDER BY id");
  res.json(rows);
});
app.post("/api/users", async (req, res) => {
  const { username, password, name, role, emoji } = req.body;
  try {
    const hash = bcrypt.hashSync(password || "1234", 10);
    const [r] = await q("INSERT INTO users (username,password,name,role,emoji) VALUES (?,?,?,?,?)",
      [username.toLowerCase().trim(), hash, name, role||"Staff", emoji||"🧑‍🔧"]);
    res.json({ id: r.insertId, username, name, role: role||"Staff", emoji: emoji||"🧑‍🔧" });
  } catch(e) { res.status(400).json({ error: "Username already exists" }); }
});
app.put("/api/users/:id", async (req, res) => {
  const { name, role, emoji, password } = req.body;
  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    await q("UPDATE users SET name=?,role=?,emoji=?,password=? WHERE id=?", [name,role,emoji,hash,req.params.id]);
  } else {
    await q("UPDATE users SET name=?,role=?,emoji=? WHERE id=?", [name,role,emoji,req.params.id]);
  }
  res.json({ ok: true });
});
app.delete("/api/users/:id", async (req, res) => {
  await q("DELETE FROM users WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ── CATEGORIES ───────────────────────────────────────────────────────────────
app.get("/api/categories", async (_, res) => {
  const [rows] = await q("SELECT * FROM categories ORDER BY id");
  res.json(rows);
});
app.post("/api/categories", async (req, res) => {
  try {
    const [r] = await q("INSERT INTO categories (name,emoji) VALUES (?,?)", [req.body.name, req.body.emoji||"🏷️"]);
    res.json({ id: r.insertId, name: req.body.name, emoji: req.body.emoji||"🏷️" });
  } catch { res.status(400).json({ error: "Already exists" }); }
});
app.put("/api/categories/:id", async (req, res) => {
  await q("UPDATE categories SET name=?,emoji=? WHERE id=?", [req.body.name, req.body.emoji, req.params.id]);
  res.json({ ok: true });
});
app.delete("/api/categories/:id", async (req, res) => {
  await q("DELETE FROM categories WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ── PRODUCTS ─────────────────────────────────────────────────────────────────
app.get("/api/products", async (_, res) => {
  const [rows] = await q("SELECT * FROM products ORDER BY id DESC");
  res.json(rows.map(r=>({...r, buy: +r.buy, sell: +r.sell, stock: +r.stock, low: +r.low})));
});
app.post("/api/products", async (req, res) => {
  const p = req.body;
  const [r] = await q("INSERT INTO products (name,cat,buy,sell,stock,low,emoji,brand) VALUES (?,?,?,?,?,?,?,?)",
    [p.name, p.cat, p.buy, p.sell, p.stock, p.low||5, p.emoji||"🧸", p.brand||""]);
  res.json({ ...p, id: r.insertId });
});
app.put("/api/products/:id", async (req, res) => {
  const p = req.body;
  const [[old]] = await q("SELECT stock FROM products WHERE id=?", [req.params.id]);
  await q("UPDATE products SET name=?,cat=?,buy=?,sell=?,stock=?,low=?,emoji=?,brand=? WHERE id=?",
    [p.name, p.cat, p.buy, p.sell, p.stock, p.low, p.emoji, p.brand, req.params.id]);
  if (old && +old.stock !== +p.stock) {
    const diff = +p.stock - +old.stock;
    await logStockChange(req.params.id, diff, "manual_adjustment", "", p.updated_by||"");
  }
  res.json({ ok: true });
});
app.delete("/api/products/:id", async (req, res) => {
  await q("DELETE FROM products WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ── SALES ────────────────────────────────────────────────────────────────────
app.get("/api/sales", async (_, res) => {
  const [rows] = await q("SELECT * FROM sales ORDER BY id DESC");
  res.json(rows.map(r=>({...r,
    date: r.date?.toISOString?.().split("T")[0] || r.date,
    price: +r.price, buy_price: +r.buy_price, total: +r.total, profit: +r.profit, qty: +r.qty,
    phone: r.phone||"", address: r.address||""
  })));
});
app.post("/api/sales", async (req, res) => {
  const s = req.body;
  const [r] = await q(
    "INSERT INTO sales (inv,date,time,product_id,product_name,emoji,qty,price,buy_price,total,profit,customer,phone,address,payment,sold_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [s.inv,s.date,s.time,s.productId||null,s.productName,s.emoji||"🧸",s.qty,s.price,s.buyPrice||0,s.total,s.profit||0,s.customer||"Walk-in",s.phone||"",s.address||"",s.payment||"Cash",s.soldBy||""]);
  await q("UPDATE products SET stock = stock - ? WHERE id = ?", [s.qty, s.productId]);
  await logStockChange(s.productId, -s.qty, "sale", s.inv, s.soldBy||"");
  res.json({ ...s, id: r.insertId });
});

app.put("/api/sales/:id", async (req, res) => {
  try {
    const s = req.body;
    await q(
      "UPDATE sales SET product_name=?,qty=?,price=?,total=?,profit=?,customer=?,payment=?,date=? WHERE id=?",
      [s.product_name, +s.qty, +s.price, +s.total, +s.profit, s.customer, s.payment, s.date, req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/sales/:id", async (req, res) => {
  try {
    // Get sale first to restore stock
    const [[sale]] = await q("SELECT * FROM sales WHERE id=?", [req.params.id]);
    if (sale && sale.product_id) {
      await q("UPDATE products SET stock = stock + ? WHERE id=?", [sale.qty, sale.product_id]);
      await logStockChange(sale.product_id, +sale.qty, "sale_deleted", sale.inv, "");
    }
    await q("DELETE FROM sales WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── EXPENSES ─────────────────────────────────────────────────────────────────
app.get("/api/expenses", async (_, res) => {
  const [rows] = await q("SELECT * FROM expenses ORDER BY id DESC");
  res.json(rows.map(r=>({...r,
    date: r.date?.toISOString?.().split("T")[0] || r.date,
    amount: +r.amount
  })));
});
app.post("/api/expenses", async (req, res) => {
  const e = req.body;
  const [r] = await q("INSERT INTO expenses (name,cat,amount,date,notes) VALUES (?,?,?,?,?)",
    [e.name, e.cat, e.amount, e.date, e.notes||""]);
  res.json({ ...e, id: r.insertId });
});
app.delete("/api/expenses/:id", async (req, res) => {
  await q("DELETE FROM expenses WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});

// ── PURCHASES ────────────────────────────────────────────────────────────────
app.get("/api/purchases", async (_, res) => {
  const [rows] = await q("SELECT * FROM purchases ORDER BY id DESC");
  for (const row of rows) {
    const [items] = await q("SELECT * FROM purchase_items WHERE purchase_id = ?", [row.id]);
    row.items = items;
    row.order_date = row.order_date?.toISOString?.().split("T")[0] || row.order_date;
  }
  res.json(rows);
});
app.post("/api/purchases", async (req, res) => {
  const p = req.body;
  const [r] = await q(
    `INSERT INTO purchases (supplier_name,order_date,status,product_cost_bdt,china_shipping_bdt,cnf_bdt,
     customs_duty_bdt,vat_bdt,agent_fees_bdt,local_transport_bdt,other_bdt,total_landed,total_qty,cost_per_unit,notes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [p.supplierName,p.orderDate,p.status,p.productCostBDT||0,p.chinaShippingBDT||0,p.cnfBDT||0,
     p.customsDutyBDT||0,p.vatBDT||0,p.agentFeesBDT||0,p.localTransportBDT||0,p.otherBDT||0,
     p.totalLanded||0,p.totalQty||0,p.costPerUnit||0,p.notes||""]);
  const poId = r.insertId;
  for (const item of (p.items||[]))
    await q("INSERT INTO purchase_items (purchase_id,product_id,qty) VALUES (?,?,?)", [poId, item.productId||null, item.qty||0]);
  res.json({ ...p, id: poId });
});
app.put("/api/purchases/:id/status", async (req, res) => {
  const { status } = req.body;
  await q("UPDATE purchases SET status=? WHERE id=?", [status, req.params.id]);
  if (status === "received") {
    const [[po]] = await q("SELECT * FROM purchases WHERE id=?", [req.params.id]);
    const [items] = await q("SELECT * FROM purchase_items WHERE purchase_id=?", [req.params.id]);
    if (po && items.length > 0)
      for (const item of items)
        if (item.product_id)
          await q("UPDATE products SET stock = stock + ?, buy = ? WHERE id = ?",
            [item.qty, Math.round(po.cost_per_unit), item.product_id]);
          await logStockChange(item.product_id, item.qty, "purchase_received", `PO-${req.params.id}`, "");
  }
  res.json({ ok: true });
});

// ── STAKEHOLDERS ─────────────────────────────────────────────────────────────
app.get("/api/stakeholders", async (_, res) => {
  const [rows] = await q("SELECT * FROM stakeholders ORDER BY id");
  for (const row of rows) {
    const [txs] = await q("SELECT * FROM stakeholder_transactions WHERE stakeholder_id=? ORDER BY date DESC", [row.id]);
    row.transactions = txs.map(t=>({...t, date: t.date?.toISOString?.().split("T")[0]||t.date, note: t.note||''}));
  }
  res.json(rows);
});
app.post("/api/stakeholders", async (req, res) => {
  const { name, emoji, share_pct, note } = req.body;
  const [r] = await q("INSERT INTO stakeholders (name,emoji,share_pct,note) VALUES (?,?,?,?)",
    [name, emoji||"👤", share_pct||0, note||""]);
  res.json({ id: r.insertId, name, emoji: emoji||"👤", share_pct: share_pct||0, note: note||"", transactions: [] });
});
app.put("/api/stakeholders/:id", async (req, res) => {
  const { name, emoji, share_pct, note } = req.body;
  await q("UPDATE stakeholders SET name=?,emoji=?,share_pct=?,note=? WHERE id=?",
    [name, emoji, share_pct, note, req.params.id]);
  res.json({ ok: true });
});
app.delete("/api/stakeholders/:id", async (req, res) => {
  await q("DELETE FROM stakeholders WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});
app.post("/api/stakeholders/:id/transactions", async (req, res) => {
  const { type, amount, date, note } = req.body;
  const [r] = await q("INSERT INTO stakeholder_transactions (stakeholder_id,type,amount,date,note) VALUES (?,?,?,?,?)",
    [req.params.id, type, amount, date, note||""]);
  res.json({ id: r.insertId, stakeholder_id: +req.params.id, type, amount, date, note: note||"" });
});
app.delete("/api/stakeholders/transactions/:id", async (req, res) => {
  await q("DELETE FROM stakeholder_transactions WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});


// ── DELIVERIES / PATHAO ───────────────────────────────────────────────────────
app.get("/api/deliveries", async (_, res) => {
  try {
    const [rows] = await q("SELECT * FROM deliveries ORDER BY id DESC");
    res.json(rows.map(r => ({
      ...r,
      created_at: r.created_at?.toISOString?.().split("T")[0] || r.created_at,
      amount_to_collect: +r.amount_to_collect,
      delivery_charge: +r.delivery_charge
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/deliveries", async (req, res) => {
  try {
    const d = req.body;
    // Create order on Pathao
    const pathaoRes = await Pathao.createOrder({
      merchant_order_id : d.merchant_order_id,
      recipient_name    : d.recipient_name,
      recipient_phone   : d.recipient_phone,
      recipient_address : d.recipient_address,
      amount_to_collect : d.amount_to_collect,
      item_description  : d.item_description || "",
      item_quantity     : d.item_quantity || 1,
      item_weight       : d.item_weight || 0.5,
      note              : d.note || "",
    });

    if (pathaoRes.status !== 200) {
      return res.status(400).json({ error: "Pathao error: " + JSON.stringify(pathaoRes.body) });
    }

    const consignment_id = pathaoRes.body?.data?.consignment_id || null;
    const pathao_status  = pathaoRes.body?.data?.order_status   || "Pending";

    const delivery_charge = d.delivery_type === "outside" ? 150 : 80;
    const product_price = +d.amount_to_collect || 0;
    const buy_price = +d.buy_price || 0;
    const profit = product_price - buy_price;
    const today = new Date().toISOString().split("T")[0];
    const timeNow = new Date().toLocaleTimeString("en-BD",{hour:"2-digit",minute:"2-digit"});

    // Deduct stock if product_id is provided
    if (d.product_id) {
      await q("UPDATE products SET stock = stock - ? WHERE id = ?", [d.item_quantity||1, d.product_id]);
      await logStockChange(d.product_id, -(d.item_quantity||1), "pathao_delivery", inv, d.created_by||"");
    }

    // Auto-create a sale record — total = product price only, delivery charge excluded
    const inv = d.merchant_order_id || ("THC-"+Date.now().toString().slice(-6));
    const [saleRow] = await q(
      `INSERT INTO sales (inv,date,time,product_id,product_name,emoji,qty,price,buy_price,total,profit,customer,payment,sold_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [inv, today, timeNow, d.product_id||null, d.item_description||"Pathao Order", "🛵",
       d.item_quantity||1, product_price, buy_price, product_price, profit,
       d.recipient_name, "Pathao COD", d.created_by||""]
    );
    const sale_id = saleRow.insertId;

    const [r] = await q(
      `INSERT INTO deliveries (sale_id,consignment_id,merchant_order_id,recipient_name,recipient_phone,
       recipient_address,amount_to_collect,item_description,item_quantity,item_weight,note,status,pathao_status,delivery_type,delivery_charge)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [sale_id, consignment_id, inv, d.recipient_name, d.recipient_phone,
       d.recipient_address, d.amount_to_collect, d.item_description||"", d.item_quantity||1,
       d.item_weight||0.5, d.note||"", "pending", pathao_status, d.delivery_type||"inside", delivery_charge]
    );

    res.json({
      id: r.insertId,
      sale_id,
      consignment_id,
      pathao_status,
      total_amount: product_price + delivery_charge,
      delivery_charge,
      pathao_response: pathaoRes.body,
      ...d
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/deliveries/:id/sync", async (req, res) => {
  try {
    const [[delivery]] = await q("SELECT * FROM deliveries WHERE id=?", [req.params.id]);
    if (!delivery) return res.status(404).json({ error: "Not found" });
    if (!delivery.consignment_id) return res.status(400).json({ error: "No consignment ID" });

    const pathaoRes = await Pathao.getOrderStatus(delivery.consignment_id);
    if (pathaoRes.status === 200) {
      const pathao_status = pathaoRes.body?.data?.order_status || delivery.pathao_status;
      const status = pathao_status?.toLowerCase().includes("deliver") ? "delivered"
                   : pathao_status?.toLowerCase().includes("cancel") ? "cancelled"
                   : "pending";
      await q("UPDATE deliveries SET pathao_status=?, status=? WHERE id=?",
        [pathao_status, status, req.params.id]);
      res.json({ ok: true, pathao_status, status });
    } else {
      res.status(400).json({ error: "Pathao sync failed", response: pathaoRes.body });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});


app.put("/api/deliveries/:id/cancel", async (req, res) => {
  try {
    // Get the delivery to find its sale_id
    const [[delivery]] = await q("SELECT * FROM deliveries WHERE id=?", [req.params.id]);
    if (!delivery) return res.status(404).json({ error: "Not found" });
    // Delete the linked sale so it disappears from revenue
    if (delivery.sale_id) {
      await q("DELETE FROM sales WHERE id=?", [delivery.sale_id]);
    }
    // Restore stock if product was linked
    if (delivery.product_id) {
      await q("UPDATE products SET stock = stock + ? WHERE id = ?", [delivery.item_quantity||1, delivery.product_id]);
      await logStockChange(delivery.product_id, delivery.item_quantity||1, "delivery_cancelled", delivery.consignment_id||"", "");
    }
    await q("UPDATE deliveries SET status='cancelled', pathao_status='Cancelled' WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/deliveries/:id", async (req, res) => {
  await q("DELETE FROM deliveries WHERE id=?", [req.params.id]);
  res.json({ ok: true });
});


app.get("/api/delivery-stats", async (_, res) => {
  try {
    const [[stats]] = await q(`
      SELECT 
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN delivery_charge ELSE 0 END), 0) as total_delivery_revenue,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN amount_to_collect ELSE 0 END), 0) as total_cod,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        COUNT(*) as total_count
      FROM deliveries
    `);
    res.json([{...stats, date: new Date().toISOString().split("T")[0]}]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/pathao/zones", async (_, res) => {
  try {
    const result = await Pathao.getZoneList(process.env.PATHAO_CITY_ID || 1);
    res.json(result.body);
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// ── STOCK HISTORY ─────────────────────────────────────────────────────────────
app.get("/api/stock-history", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const product_id = req.query.product_id ? parseInt(req.query.product_id) : null;
    let rows;
    if (product_id) {
      [rows] = await q(`SELECT * FROM stock_history WHERE product_id=? ORDER BY id DESC LIMIT ${limit}`, [product_id]);
    } else {
      [rows] = await q(`SELECT * FROM stock_history ORDER BY id DESC LIMIT ${limit}`, []);
    }
    res.json(rows.map(r=>({...r, created_at: r.created_at?.toISOString?.().replace("T"," ").slice(0,16)||r.created_at})));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATHAO PAYOUTS ────────────────────────────────────────────────────────────
app.get("/api/payouts", async (req, res) => {
  try {
    const [rows] = await q("SELECT * FROM pathao_payouts ORDER BY id DESC");
    for (const row of rows) {
      const [items] = await q(
        "SELECT pd.delivery_id, d.consignment_id, d.recipient_name, d.amount_to_collect, d.delivery_charge FROM payout_deliveries pd JOIN deliveries d ON d.id = pd.delivery_id WHERE pd.payout_id = ?",
        [parseInt(row.id)]
      );
      row.deliveries = items;
      row.date = row.date?.toISOString?.().split("T")[0] || row.date;
    }
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/payouts", async (req, res) => {
  try {
    const { payout_ref, amount, date, note, delivery_ids } = req.body;
    const [r] = await q(
      "INSERT INTO pathao_payouts (payout_ref,amount,date,note,status) VALUES (?,?,?,?,?)",
      [payout_ref||"", amount, date, note||"", "received"]
    );
    const poId = r.insertId;
    for (const did of (delivery_ids||[])) {
      await q("INSERT INTO payout_deliveries (payout_id,delivery_id) VALUES (?,?)", [poId, did]);
      await q("UPDATE deliveries SET status='paid' WHERE id=?", [did]);
    }
    res.json({ id: poId, ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/payouts/:id", async (req, res) => {
  try {
    // Reset delivery status back to delivered
    const [items] = await q("SELECT delivery_id FROM payout_deliveries WHERE payout_id=?", [req.params.id]);
    for (const item of items) {
      await q("UPDATE deliveries SET status='delivered' WHERE id=?", [item.delivery_id]);
    }
    await q("DELETE FROM pathao_payouts WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Unpaid delivered deliveries (ready to be added to a payout)
app.get("/api/payouts/unpaid", async (req, res) => {
  try {
    const [rows] = await q(`
      SELECT * FROM deliveries
      WHERE status = 'delivered'
      ORDER BY id DESC
    `);
    res.json(rows.map(r=>({...r, amount_to_collect:+r.amount_to_collect, delivery_charge:+r.delivery_charge})));
  } catch(e) { res.status(500).json({ error: e.message }); }
});




// ── PUBLIC ORDER FORM ─────────────────────────────────────────────────────────
// Saves to pending_orders — awaits approval before Pathao is created
// Public product list for the order form (only in-stock items)
app.get("/api/products/public", async (_, res) => {
  try {
    const [rows] = await q("SELECT id, name, emoji, sell, stock FROM products WHERE stock > 0 ORDER BY name");
    res.json(rows.map(r => ({ ...r, sell: +r.sell, stock: +r.stock })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/orders/public", async (req, res) => {
  try {
    const customer_name    = req.body.customer_name    || "";
    const customer_phone   = req.body.customer_phone   || "";
    const customer_address = req.body.customer_address || "";
    const product_id       = req.body.product_id ? +req.body.product_id : null;
    const qty              = parseInt(req.body.qty) || 1;
    const sell_price       = parseFloat(req.body.sell_price)      || 0;
    const delivery_type    = req.body.delivery_type               || "inside";
    const delivery_charge  = parseFloat(req.body.delivery_charge) || 80;
    const total            = parseFloat(req.body.total)           || delivery_charge;
    const notes            = req.body.notes || "";
    const inv              = "ORD-" + Date.now().toString().slice(-6);

    // Resolve product name from DB if product_id provided
    let product_name = req.body.product_name || "Order";
    if (product_id) {
      const [[prod]] = await q("SELECT name FROM products WHERE id=?", [product_id]);
      if (prod) product_name = prod.name;
    }

    await q(
      "INSERT INTO pending_orders (inv,customer_name,customer_phone,customer_address,product_details,product_price,delivery_type,delivery_charge,total,notes,status,product_id,qty) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [inv, customer_name, customer_phone, customer_address, product_name, sell_price, delivery_type, delivery_charge, total, notes, "pending", product_id, qty]
    );

    res.json({ ok: true, inv, customer_name, total });
  } catch(e) {
    console.error("Public order error:", e.message);
    res.status(500).json({ error: e.message });
  }
});


// ── PENDING ORDERS ────────────────────────────────────────────────────────────
app.get("/api/pending-orders", async (_, res) => {
  try {
    const [rows] = await q("SELECT * FROM pending_orders ORDER BY id DESC");
    res.json(rows.map(r=>({...r,
      product_price: +r.product_price, delivery_charge: +r.delivery_charge, total: +r.total,
      created_at: r.created_at?.toISOString?.().replace("T"," ").slice(0,16)||r.created_at
    })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/pending-orders/:id/approve", async (req, res) => {
  try {
    const [[po]] = await q("SELECT * FROM pending_orders WHERE id=?", [req.params.id]);
    if (!po) return res.status(404).json({ error: "Not found" });

    const isWC           = po.source === "woocommerce";
    const final_price    = parseFloat(req.body.final_price) || +po.product_price;
    const delivery_charge = +po.delivery_charge || 80;
    const total          = final_price + delivery_charge;
    const today          = new Date().toISOString().split("T")[0];
    const timeNow        = new Date().toLocaleTimeString("en-BD", {hour:"2-digit", minute:"2-digit"});

    const product_id = req.body.product_id ? +req.body.product_id : (po.product_id ? +po.product_id : null);
    const order_qty  = req.body.qty ? +req.body.qty : (po.qty ? +po.qty : 1);
    let buy_price = 0, sale_emoji = isWC ? "🛒" : "🛒";
    if (product_id) {
      const [[prod]] = await q("SELECT buy, emoji FROM products WHERE id=?", [product_id]);
      if (prod) { buy_price = +prod.buy; sale_emoji = prod.emoji || "🛒"; }
    }
    const profit = (final_price - buy_price) * order_qty;

    const paymentMethod = isWC ? "WooCommerce" : "Cash on delivery (COD)";
    const soldBy        = isWC ? "WooCommerce" : "Order Form";

    // Create sale
    const [saleRow] = await q(
      "INSERT INTO sales (inv,date,time,product_id,product_name,emoji,qty,price,buy_price,total,profit,customer,phone,address,payment,sold_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [po.inv, today, timeNow, product_id, po.product_details||"Order", sale_emoji,
       order_qty, final_price, buy_price, final_price * order_qty, profit,
       po.customer_name, po.customer_phone, po.customer_address,
       paymentMethod, soldBy]
    );

    // Deduct stock if a product was linked
    if (product_id) {
      await q("UPDATE products SET stock = stock - ? WHERE id = ?", [order_qty, product_id]);
      await logStockChange(product_id, -order_qty, "sale", po.inv, soldBy);
    }

    // Create Pathao order
    let consignment_id = null, pathao_status = "Pending";
    try {
      const pathaoRes = await Pathao.createOrder({
        merchant_order_id : po.inv,
        recipient_name    : po.customer_name,
        recipient_phone   : po.customer_phone,
        recipient_address : po.customer_address,
        amount_to_collect : total,
        item_description  : po.product_details || "Order",
        item_quantity     : order_qty,
        item_weight       : 0.5,
        note              : po.notes || (isWC ? `WooCommerce Order #${po.wc_order_id}` : ""),
      });
      console.log("Pathao approve:", JSON.stringify(pathaoRes.body));
      consignment_id = pathaoRes.body?.data?.consignment_id || null;
      pathao_status  = pathaoRes.body?.data?.order_status   || "Pending";
    } catch(e) { console.error("Pathao approve error:", e.message); }

    // Create delivery record
    const [delRow] = await q(
      "INSERT INTO deliveries (sale_id,consignment_id,merchant_order_id,recipient_name,recipient_phone,recipient_address,amount_to_collect,item_description,item_quantity,item_weight,note,status,pathao_status,delivery_type,delivery_charge) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [saleRow.insertId, consignment_id, po.inv, po.customer_name, po.customer_phone,
       po.customer_address, total, po.product_details||"Order", order_qty, 0.5, po.notes||"",
       "pending", pathao_status, po.delivery_type||"inside", delivery_charge]
    );

    await q("UPDATE pending_orders SET status='approved', sale_id=?, delivery_id=? WHERE id=?",
      [saleRow.insertId, delRow.insertId, req.params.id]);

    // For WooCommerce orders, update the wc_orders record with sale and delivery IDs
    if (isWC && po.wc_order_id) {
      await q("UPDATE wc_orders SET mgt_sale_id=?, delivery_id=?, status='approved' WHERE wc_order_id=?",
        [saleRow.insertId, delRow.insertId, po.wc_order_id]);
    }

    res.json({ ok: true, consignment_id, pathao_status, total, sale_id: saleRow.insertId });
  } catch(e) {
    console.error("Approve error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/pending-orders/:id/reject", async (req, res) => {
  try {
    await q("UPDATE pending_orders SET status='rejected' WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/pending-orders/:id", async (req, res) => {
  try {
    await q("DELETE FROM pending_orders WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PRE-ORDERS (Google Sheets) ────────────────────────────────────────────────
const SHEET_ID = "1ZlMpj92NW51KLSNv1CP41HI5ow3VxyOuCT_IXLqrayA";

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

async function fetchSheetData() {
  const https = require("https");
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1288345852`;

  const redirectUrl = await new Promise((resolve, reject) => {
    const urlObj = new URL(SHEET_URL);
    https.get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        resolve(res.headers.location);
      } else if (res.statusCode === 200) {
        resolve(SHEET_URL);
      } else {
        reject(new Error("Step1 failed: HTTP " + res.statusCode));
      }
      res.resume();
    }).on("error", reject);
  });

  const csvData = await new Promise((resolve, reject) => {
    const urlObj = new URL(redirectUrl);
    let data = "";
    https.get({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error("Step2 failed: HTTP " + res.statusCode));
      res.on("data", d => data += d);
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });

  const lines = csvData.split("\n").filter(l => l.trim());
  if (lines.length < 2) throw new Error("Sheet has no data rows");

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (!cols[2] && !cols[6]) continue;
    result.push({
      row            : i + 1,
      timestamp      : cols[0]  || "",
      email          : cols[1]  || "",
      customer_name  : cols[2]  || "",
      comments       : cols[3]  || "",
      delivery_agreed: cols[4]  || "",
      address        : cols[5]  || "",
      phone          : (cols[6] || "").replace(/[^0-9+]/g, ""),
      paid_amount    : parseFloat((cols[9]  || "0").replace(/[^0-9.]/g, "")) || 0,
      product_price  : parseFloat((cols[10] || "0").replace(/[^0-9.]/g, "")) || 0,
    });
  }
  return result;
}

app.post("/api/preorders/sync", async (req, res) => {
  try {
    const rows = await fetchSheetData();
    let added = 0, skipped = 0;
    for (const row of rows) {
      let month = "";
      if (row.timestamp) {
        const d = new Date(row.timestamp);
        if (!isNaN(d)) month = d.toLocaleString("en-BD", { month: "long", year: "numeric" });
      }
      const [[existing]] = await q("SELECT id FROM preorders WHERE sheet_row=?", [row.row]);
      if (existing) { skipped++; continue; }
      await q(
        "INSERT INTO preorders (sheet_row,timestamp,email,customer_name,comments,delivery_agreed,address,phone,paid_amount,product_price,month,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [row.row, row.timestamp, row.email, row.customer_name, row.comments,
         row.delivery_agreed, row.address, row.phone,
         row.paid_amount, row.product_price, month, "pending"]
      );
      added++;
    }
    res.json({ ok: true, total: rows.length, added, skipped });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/preorders", async (req, res) => {
  try {
    const { month } = req.query;
    let rows;
    if (month) {
      [rows] = await q("SELECT * FROM preorders WHERE month=? ORDER BY id DESC", [month]);
    } else {
      [rows] = await q("SELECT * FROM preorders ORDER BY id DESC");
    }
    res.json(rows.map(r => ({ ...r, paid_amount: +r.paid_amount, product_price: +r.product_price, courier: +r.courier||0, due: +r.due||0, final_price: +r.final_price||0 })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/preorders/months", async (_, res) => {
  try {
    const [rows] = await q("SELECT DISTINCT month, COUNT(*) as count FROM preorders WHERE month != '' GROUP BY month ORDER BY MIN(id) DESC");
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/preorders/:id/status", async (req, res) => {
  try {
    await q("UPDATE preorders SET status=?, notes=? WHERE id=?",
      [req.body.status, req.body.notes||"", req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/preorders/:id", async (req, res) => {
  try {
    const { paid_amount, product_price, courier, due, final_price, customer_name, phone, address } = req.body;
    await q(
      "UPDATE preorders SET paid_amount=?, product_price=?, courier=?, due=?, final_price=?, customer_name=?, phone=?, address=? WHERE id=?",
      [+paid_amount||0, +product_price||0, +courier||0, +due||0, +final_price||0,
       customer_name||"", phone||"", address||"", req.params.id]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/preorders/:id/pathao", async (req, res) => {
  try {
    const [[po]] = await q("SELECT * FROM preorders WHERE id=?", [req.params.id]);
    if (!po) return res.status(404).json({ error: "Not found" });
    const isOutside = !po.address?.toLowerCase().includes("dhaka");
    const deliveryCharge = isOutside ? 150 : 80;
    const inv = "PRE-" + po.id;
    const pathaoRes = await Pathao.createOrder({
      merchant_order_id: inv, recipient_name: po.customer_name,
      recipient_phone: po.phone, recipient_address: po.address,
      amount_to_collect: +po.product_price || +po.paid_amount,
      item_description: po.comments || "Pre-order",
      item_quantity: 1, item_weight: 0.5, note: po.comments || "",
    });
    const consignment_id = pathaoRes.body?.data?.consignment_id || null;
    const pathao_status  = pathaoRes.body?.data?.order_status   || "Pending";
    const [delRow] = await q(
      "INSERT INTO deliveries (sale_id,consignment_id,merchant_order_id,recipient_name,recipient_phone,recipient_address,amount_to_collect,item_description,item_quantity,item_weight,note,status,pathao_status,delivery_type,delivery_charge) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      [null, consignment_id, inv, po.customer_name, po.phone, po.address,
       +po.product_price||+po.paid_amount, po.comments||"Pre-order", 1, 0.5,
       po.comments||"", "pending", pathao_status, isOutside?"outside":"inside", deliveryCharge]
    );
    await q("UPDATE preorders SET status='pathao_created', delivery_id=? WHERE id=?", [delRow.insertId, req.params.id]);
    res.json({ ok: true, consignment_id, pathao_status, delivery_id: delRow.insertId });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/preorders/:id", async (req, res) => {
  try {
    await q("DELETE FROM preorders WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── WOOCOMMERCE SYNC ──────────────────────────────────────────────────────────

// Helper: log sync event
async function wcLog(type, status, message) {
  try { await q("INSERT INTO wc_sync_log (type,status,message) VALUES (?,?,?)", [type, status, message]); }
  catch(e) { console.error("Log error:", e.message); }
}

// Helper: process a single WC order into MGT pending approval queue
async function processWCOrder(order) {
  const wcOrderId = order.id;

  // Check if already in wc_orders (processed or pending)
  const [[existing]] = await q("SELECT id FROM wc_orders WHERE wc_order_id=?", [wcOrderId]);
  if (existing) return { skipped: true, reason: "already processed" };

  const customerName    = `${order.billing?.first_name||""} ${order.billing?.last_name||""}`.trim() || "WooCommerce Customer";
  const customerPhone   = order.billing?.phone || "";
  const customerAddress = [order.shipping?.address_1, order.shipping?.address_2, order.shipping?.city].filter(Boolean).join(", ") || order.billing?.address_1 || "";
  const paymentMethod   = order.payment_method_title || "WooCommerce";
  const orderTotal      = +order.total || 0;
  const inv             = `WC-${wcOrderId}`;

  const itemSummary = [];
  for (const item of (order.line_items || [])) {
    itemSummary.push(`${item.name} x${item.quantity || 1}`);
  }
  const productDesc = itemSummary.join(", ");

  const isOutside    = !customerAddress.toLowerCase().includes("dhaka");
  const deliveryCharge = isOutside ? 150 : 80;
  const total        = orderTotal + deliveryCharge;

  // Route into pending_orders for admin approval before Pathao
  const [pendingRow] = await q(
    `INSERT INTO pending_orders (inv,customer_name,customer_phone,customer_address,product_details,product_price,delivery_type,delivery_charge,total,status,source,wc_order_id,wc_items)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [inv, customerName, customerPhone, customerAddress, productDesc, orderTotal,
     isOutside ? "outside" : "inside", deliveryCharge, total,
     "pending", "woocommerce", wcOrderId, JSON.stringify(itemSummary)]
  );

  // Record in wc_orders with pending_approval status (no sale/delivery yet)
  await q(
    `INSERT INTO wc_orders (wc_order_id,status,customer_name,customer_phone,customer_address,total,payment_method,items)
     VALUES (?,?,?,?,?,?,?,?)`,
    [wcOrderId, "pending_approval", customerName, customerPhone,
     customerAddress, orderTotal, paymentMethod, JSON.stringify(itemSummary)]
  );

  await wcLog("order_sync", "success", `WC order #${wcOrderId} → pending approval (ID: ${pendingRow.insertId})`);
  return { success: true, pendingOrderId: pendingRow.insertId };
}

// WooCommerce order webhook
app.post("/api/webhook/woocommerce", async (req, res) => {
  try {
    const order = req.body;
    console.log(`🛒 WooCommerce webhook: order #${order.id} (${order.status})`);

    // Only process paid/processing orders
    if (!["processing", "completed", "on-hold"].includes(order.status)) {
      return res.json({ ok: true, skipped: true, reason: `Status ${order.status} not actionable` });
    }

    const result = await processWCOrder(order);
    res.json({ ok: true, ...result });
  } catch(e) {
    console.error("WC webhook error:", e.message);
    await wcLog("webhook", "error", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Sync all WooCommerce products to MGT mapping table
app.post("/api/wc/sync-products", async (req, res) => {
  try {
    console.log("🔄 Syncing WooCommerce products...");
    const wcProducts = await WC.getAllProducts();
    let mapped = 0, created = 0, skipped = 0;

    for (const wcp of wcProducts) {
      const sku  = wcp.sku || "";
      const name = wcp.name || "";
      const wcId = wcp.id;
      const wcStock = wcp.stock_quantity || 0;

      // Check if already mapped
      const [[existing]] = await q("SELECT id FROM wc_product_map WHERE wc_product_id=?", [wcId]);
      if (existing) { skipped++; continue; }

      // Try to find matching MGT product by SKU (brand field) or name
      let mgtProduct = null;
      if (sku) {
        const [[byBrand]] = await q("SELECT * FROM products WHERE brand=?", [sku]);
        if (byBrand) mgtProduct = byBrand;
      }
      if (!mgtProduct && name) {
        const nameSearch = "%" + name.substring(0,20) + "%";
      const [byName] = await q("SELECT * FROM products WHERE name LIKE ? LIMIT 1", [nameSearch]);
        if (byName.length > 0) mgtProduct = byName[0];
      }

      if (mgtProduct) {
        // Map existing MGT product to WC product
        // Update MGT stock and price from WooCommerce (WC is master)
        await q("UPDATE products SET stock=?, sell=? WHERE id=?",
          [wcStock, +wcp.price||+wcp.regular_price||mgtProduct.sell, mgtProduct.id]);
        await q("INSERT IGNORE INTO wc_product_map (mgt_product_id,wc_product_id,wc_sku,wc_name) VALUES (?,?,?,?)",
          [mgtProduct.id, wcId, sku, name]);
        await q("UPDATE wc_product_map SET last_sync=NOW(), wc_name=? WHERE wc_product_id=?", [name, wcId]);
        mapped++;
      } else {
        // Create new MGT product from WC product
        const sellPrice = +wcp.price || +wcp.regular_price || 0;
        const cat = wcp.categories?.[0]?.name || "Other";
        const [r] = await q(
          "INSERT INTO products (name,cat,buy,sell,stock,low,emoji,brand) VALUES (?,?,?,?,?,?,?,?)",
          [name, cat, 0, sellPrice, wcStock, 5, "🛒", sku]
        );
        await q("INSERT IGNORE INTO wc_product_map (mgt_product_id,wc_product_id,wc_sku,wc_name) VALUES (?,?,?,?)",
          [r.insertId, wcId, sku, name]);
        created++;
      }
    }

    await wcLog("product_sync", "success", `Synced ${wcProducts.length} WC products: ${mapped} mapped, ${created} created, ${skipped} skipped`);
    res.json({ ok: true, total: wcProducts.length, mapped, created, skipped });
  } catch(e) {
    await wcLog("product_sync", "error", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Sync recent WooCommerce orders (for backfill)
app.post("/api/wc/sync-orders", async (req, res) => {
  try {
    const { pages=1 } = req.body;
    let totalProcessed=0, totalSkipped=0, totalErrors=0;

    for (let page=1; page<=pages; page++) {
      const orders = await WC.getOrders(page, 50);
      if (!orders.length) break;

      for (const order of orders) {
        // Only import Processing orders - skip completed/cancelled/etc
        if (order.status !== "processing") { totalSkipped++; continue; }
        try {
          const result = await processWCOrder(order);
          if (result.skipped) totalSkipped++;
          else totalProcessed++;
        } catch(e) {
          totalErrors++;
          await wcLog("order_sync", "error", `Order #${order.id}: ${e.message}`);
        }
      }
    }

    res.json({ ok: true, processed: totalProcessed, skipped: totalSkipped, errors: totalErrors });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Update WooCommerce stock when MGT stock changes
app.post("/api/wc/push-stock/:mgtProductId", async (req, res) => {
  try {
    const [[map]] = await q("SELECT wc_product_id FROM wc_product_map WHERE mgt_product_id=?", [req.params.mgtProductId]);
    if (!map) return res.json({ ok: false, reason: "Product not mapped to WooCommerce" });
    const [[prod]] = await q("SELECT stock FROM products WHERE id=?", [req.params.mgtProductId]);
    if (!prod) return res.status(404).json({ error: "Product not found" });
    await WC.updateStock(map.wc_product_id, prod.stock);
    res.json({ ok: true, wc_product_id: map.wc_product_id, new_stock: prod.stock });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get WooCommerce sync status
app.get("/api/wc/status", async (req, res) => {
  try {
    const [[{mapped}]]  = await q("SELECT COUNT(*) as mapped FROM wc_product_map");
    const [[{orders}]]  = await q("SELECT COUNT(*) as orders FROM wc_orders");
    const [logs]        = await q("SELECT * FROM wc_sync_log ORDER BY id DESC LIMIT 20");
    const [[{errors}]]  = await q("SELECT COUNT(*) as errors FROM wc_sync_log WHERE status='error' AND created_at > NOW() - INTERVAL 24 HOUR");
    res.json({ mapped, orders, errors, logs: logs.map(l=>({...l, created_at: l.created_at?.toISOString?.().replace("T"," ").slice(0,16)||l.created_at})) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Get WooCommerce orders list
app.get("/api/wc/orders", async (req, res) => {
  try {
    const [rows] = await q("SELECT * FROM wc_orders ORDER BY id DESC LIMIT 100");
    res.json(rows.map(r=>({...r, synced_at: r.synced_at?.toISOString?.().replace("T"," ").slice(0,16)||r.synced_at, total: +r.total})));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Register WooCommerce webhook automatically
app.post("/api/wc/register-webhook", async (req, res) => {
  try {
    const deliveryUrl = `${req.protocol}://${req.get("host")}/api/webhook/woocommerce`;
    const result = await WC.registerWebhook(deliveryUrl);
    res.json({ ok: result.status === 201, result: result.body });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Cron: sync WC stock every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    const [maps] = await q("SELECT mgt_product_id, wc_product_id FROM wc_product_map");
    for (const map of maps) {
      const [[prod]] = await q("SELECT stock FROM products WHERE id=?", [map.mgt_product_id]);
      if (prod) await WC.updateStock(map.wc_product_id, +prod.stock);
    }
    console.log(`🔄 Stock sync: ${maps.length} products pushed to WooCommerce`);
  } catch(e) { console.error("Stock sync error:", e.message); }
});

// ── PATHAO WEBHOOK ────────────────────────────────────────────────────────────
// Pathao calls this URL when delivery status changes
// Set this in Pathao merchant panel: https://yourdomain.com/api/webhook/pathao
app.post("/api/webhook/pathao", async (req, res) => {
  try {
    const data = req.body;
    console.log("📦 Pathao webhook received:", JSON.stringify(data));

    const consignment_id = data.consignment_id || data.order_id;
    const pathao_status  = data.order_status || data.status;

    if (!consignment_id || !pathao_status) {
      return res.status(400).json({ error: "Missing consignment_id or status" });
    }

    // Map Pathao status to our internal status
    const statusLower = pathao_status.toLowerCase();
    let status = "pending";
    if (statusLower.includes("deliver")) status = "delivered";
    else if (statusLower.includes("cancel") || statusLower.includes("return")) status = "cancelled";
    else if (statusLower.includes("pick") || statusLower.includes("transit")) status = "in_transit";

    // Update delivery
    await q("UPDATE deliveries SET pathao_status=?, status=? WHERE consignment_id=?",
      [pathao_status, status, consignment_id]);

    // If cancelled — delete linked sale so revenue is deducted
    if (status === "cancelled") {
      const [[delivery]] = await q("SELECT * FROM deliveries WHERE consignment_id=?", [consignment_id]);
      if (delivery?.sale_id) {
        await q("DELETE FROM sales WHERE id=?", [delivery.sale_id]);
      }
    }

    console.log(`✅ Webhook: ${consignment_id} → ${pathao_status} (${status})`);
    res.json({ ok: true, consignment_id, status });
  } catch(e) {
    console.error("Webhook error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── EMAIL HELPER ──────────────────────────────────────────────────────────────
function createTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendDailyReport() {
  const transporter = createTransporter();
  if (!transporter) {
    console.log("⚠️ Email not configured — skipping daily report");
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Get yesterday stats
  const [[salesStats]] = await q(`
    SELECT
      COUNT(*) as total_sales,
      COALESCE(SUM(total), 0) as revenue,
      COALESCE(SUM(profit), 0) as gross_profit,
      COALESCE(SUM(CASE WHEN payment='Pathao COD' THEN total ELSE 0 END), 0) as pathao_revenue,
      COALESCE(SUM(CASE WHEN payment!='Pathao COD' THEN total ELSE 0 END), 0) as walkin_revenue
    FROM sales WHERE date = ?
  `, [yesterday]);

  const [[expStats]] = await q(`
    SELECT COALESCE(SUM(amount), 0) as total_expenses
    FROM expenses WHERE date = ?
  `, [yesterday]);

  const [[delivStats]] = await q(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN status='delivered' THEN 1 END) as delivered,
      COUNT(CASE WHEN status='pending' THEN 1 END) as pending,
      COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled,
      COALESCE(SUM(CASE WHEN status!='cancelled' THEN delivery_charge ELSE 0 END), 0) as delivery_income
    FROM deliveries WHERE DATE(created_at) = ?
  `, [yesterday]);

  const [lowStock] = await q(`
    SELECT name, emoji, stock, low FROM products WHERE stock <= low ORDER BY stock ASC LIMIT 10
  `);

  const [pendingDeliveries] = await q(`
    SELECT recipient_name, recipient_phone, amount_to_collect, consignment_id, pathao_status
    FROM deliveries WHERE status = 'pending' ORDER BY id DESC LIMIT 10
  `);

  const netProfit = (+salesStats.gross_profit) - (+expStats.total_expenses);
  const totalRevenue = (+salesStats.revenue) + (+delivStats.delivery_income);

  const formatBDT = n => "৳" + Number(n||0).toLocaleString("en-IN");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body{font-family:Arial,sans-serif;background:#FFF8F0;margin:0;padding:20px}
  .container{max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.1)}
  .header{background:linear-gradient(135deg,#FF6B35,#FFD166);padding:24px;text-align:center;color:#fff}
  .header h1{margin:0;font-size:24px}
  .header p{margin:6px 0 0;opacity:.85;font-size:14px}
  .body{padding:24px}
  .kpi-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
  .kpi{background:#FFF8F0;border-radius:10px;padding:14px;border:1.5px solid #F0D9C0;text-align:center}
  .kpi-label{font-size:11px;color:#9CA3AF;font-weight:700;text-transform:uppercase;margin-bottom:4px}
  .kpi-value{font-size:22px;font-weight:800;color:#1A1A2E}
  .kpi-value.green{color:#06D6A0}
  .kpi-value.red{color:#EF476F}
  .kpi-value.orange{color:#FF6B35}
  .section{margin-bottom:20px}
  .section h3{font-size:14px;font-weight:800;color:#1A1A2E;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #F0D9C0}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;padding:7px 10px;background:#FFF8F0;font-size:10px;font-weight:800;color:#9CA3AF;text-transform:uppercase}
  td{padding:7px 10px;border-bottom:1px solid #F9F0E8}
  .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:800}
  .badge-red{background:#FEE2E2;color:#991B1B}
  .badge-yellow{background:#FEF3C7;color:#92400E}
  .footer{background:#F9F0E8;padding:16px;text-align:center;font-size:12px;color:#9CA3AF}
</style></head>
<body>
<div class="container">
  <div class="header">
    <div style="font-size:36px">🎮</div>
    <h1>The Hobby Center</h1>
    <p>Daily Report — ${yesterday}</p>
  </div>
  <div class="body">
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Total Revenue</div><div class="kpi-value orange">${formatBDT(totalRevenue)}</div></div>
      <div class="kpi"><div class="kpi-label">Gross Profit</div><div class="kpi-value ${netProfit>=0?'green':'red'}">${formatBDT(salesStats.gross_profit)}</div></div>
      <div class="kpi"><div class="kpi-label">Net Profit</div><div class="kpi-value ${netProfit>=0?'green':'red'}">${formatBDT(netProfit)}</div></div>
      <div class="kpi"><div class="kpi-label">Total Sales</div><div class="kpi-value">${salesStats.total_sales}</div></div>
    </div>
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Walk-in</div><div class="kpi-value orange">${formatBDT(salesStats.walkin_revenue)}</div></div>
      <div class="kpi"><div class="kpi-label">Pathao COD</div><div class="kpi-value">${formatBDT(salesStats.pathao_revenue)}</div></div>
      <div class="kpi"><div class="kpi-label">Delivery Income</div><div class="kpi-value green">${formatBDT(delivStats.delivery_income)}</div></div>
      <div class="kpi"><div class="kpi-label">Expenses</div><div class="kpi-value red">${formatBDT(expStats.total_expenses)}</div></div>
    </div>

    <div class="section">
      <h3>🛵 Deliveries Yesterday</h3>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Total</div><div class="kpi-value">${delivStats.total}</div></div>
        <div class="kpi"><div class="kpi-label">Delivered</div><div class="kpi-value green">${delivStats.delivered}</div></div>
        <div class="kpi"><div class="kpi-label">Pending</div><div class="kpi-value orange">${delivStats.pending}</div></div>
        <div class="kpi"><div class="kpi-label">Cancelled</div><div class="kpi-value red">${delivStats.cancelled}</div></div>
      </div>
    </div>

    ${pendingDeliveries.length > 0 ? `
    <div class="section">
      <h3>⏳ Pending Deliveries (${pendingDeliveries.length})</h3>
      <table>
        <tr><th>Customer</th><th>Phone</th><th>COD</th><th>Status</th></tr>
        ${pendingDeliveries.map(d => `
        <tr>
          <td>${d.recipient_name}</td>
          <td>${d.recipient_phone}</td>
          <td><b>${formatBDT(d.amount_to_collect)}</b></td>
          <td><span class="badge badge-yellow">${d.pathao_status||'Pending'}</span></td>
        </tr>`).join("")}
      </table>
    </div>` : ""}

    ${lowStock.length > 0 ? `
    <div class="section">
      <h3>⚠️ Low Stock Alert (${lowStock.length} products)</h3>
      <table>
        <tr><th>Product</th><th>Stock</th><th>Alert Level</th></tr>
        ${lowStock.map(p => `
        <tr>
          <td>${p.emoji} ${p.name}</td>
          <td><span class="badge ${p.stock===0?'badge-red':'badge-yellow'}">${p.stock===0?'OUT OF STOCK':p.stock+' left'}</span></td>
          <td>${p.low}</td>
        </tr>`).join("")}
      </table>
    </div>` : ""}
  </div>
  <div class="footer">
    🎮 The Hobby Center · mgt.hobbycenterbd.com<br>
    This report is auto-generated every morning at 8:00 AM
  </div>
</div>
</body></html>`;

  await transporter.sendMail({
    from: `"The Hobby Center" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_REPORT_TO || process.env.EMAIL_USER,
    subject: `📊 Daily Report — ${yesterday} | Revenue: ${formatBDT(totalRevenue)} | Profit: ${formatBDT(netProfit)}`,
    html,
  });

  console.log(`✅ Daily report sent for ${yesterday}`);
}

// ── CRON: Daily report at 8:00 AM Bangladesh time (UTC+6 = 02:00 UTC) ────────
cron.schedule("0 2 * * *", async () => {
  console.log("⏰ Running daily report cron...");
  try { await sendDailyReport(); }
  catch(e) { console.error("Daily report failed:", e.message); }
});

// Manual trigger endpoint (for testing)
app.get("/api/send-report", async (req, res) => {
  try {
    await sendDailyReport();
    res.json({ ok: true, message: "Report sent!" });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Debug endpoint to test Google Sheet fetch
app.get("/api/preorders/debug", async (req, res) => {
  try {
    const https = require("https");
    const SHEET_ID = "1ZlMpj92NW51KLSNv1CP41HI5ow3VxyOuCT_IXLqrayA";
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=1288345852`;

    const fetchUrl = (reqUrl, redirectCount=0) => {
      return new Promise((resolve, reject) => {
        if(redirectCount > 5) return reject(new Error("Too many redirects"));
        const urlObj = new URL(reqUrl);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0" }
        };
        https.get(options, (r) => {
          let data = "";
          r.on("data", d => data += d);
          r.on("end", () => resolve({ status: r.statusCode, headers: r.headers, body: data.substring(0,500) }));
        }).on("error", reject);
      });
    };

    const result = await fetchUrl(url);
    // If redirect, follow it
    if([301,302,303,307,308].includes(result.status) && result.headers.location) {
      const r2 = await fetchUrl(result.headers.location);
      return res.json({ step1: result.status, redirect_to: result.headers.location, step2_status: r2.status, body_preview: r2.body });
    }
    res.json({ status: result.status, body_preview: result.body });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get("/api/health", async (_, res) => {
  try { await q("SELECT 1"); res.json({ status: "ok", db: "mysql" }); }
  catch(e) { res.status(500).json({ status: "error", error: e.message }); }
});

// ── SPA FALLBACK ──────────────────────────────────────────────────────────────
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// ── START ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function start() {
  let retries = 30;
  while (retries > 0) {
    try {
      await initDB();
      app.listen(PORT, () => {
        console.log(`\n🎮 The Hobby Center API running on port ${PORT}`);
        console.log(`🐬 MySQL: ${process.env.DB_HOST||"localhost"}:${process.env.DB_PORT||3306}/${process.env.DB_NAME||"hobbycenter"}\n`);
      });
      return;
    } catch (e) {
      retries--;
      console.error(`⏳ Waiting for MySQL... (${retries} retries left) — ${e.message}`);
      console.error("Stack:", e.stack?.split("\n")[0]);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  console.error("❌ Could not connect to MySQL. Exiting.");
  process.exit(1);
}

start();
