const https = require("https");
const http  = require("http");

const WC_URL    = process.env.WC_URL    || "https://hobbycenterbd.com";
const WC_KEY    = process.env.WC_KEY    || "";
const WC_SECRET = process.env.WC_SECRET || "";

function wcRequest(method, endpoint, body=null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString("base64");
    const url  = new URL(`${WC_URL}/wp-json/wc/v3${endpoint}`);
    const data = body ? JSON.stringify(body) : null;
    const lib  = url.protocol === "https:" ? https : http;

    const options = {
      hostname: url.hostname,
      path    : url.pathname + url.search,
      method,
      headers : {
        "Authorization" : `Basic ${auth}`,
        "Content-Type"  : "application/json",
        "Accept"        : "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };

    const req = lib.request(options, (res) => {
      let raw = "";
      res.on("data", d => raw += d);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// Get all products with pagination
async function getAllProducts() {
  let page = 1, all = [];
  while (true) {
    const res = await wcRequest("GET", `/products?per_page=100&page=${page}&status=publish`);
    if (res.status !== 200 || !Array.isArray(res.body) || res.body.length === 0) break;
    all = [...all, ...res.body];
    if (res.body.length < 100) break;
    page++;
  }
  return all;
}

// Get orders with pagination
async function getOrders(page=1, perPage=50, after=null) {
  let endpoint = `/orders?per_page=${perPage}&page=${page}&orderby=date&order=desc`;
  if (after) endpoint += `&after=${after}`;
  const res = await wcRequest("GET", endpoint);
  return res.status === 200 ? res.body : [];
}

// Update product stock in WooCommerce
async function updateStock(wcProductId, newStock) {
  return wcRequest("PUT", `/products/${wcProductId}`, { stock_quantity: newStock, manage_stock: true });
}

// Get single order
async function getOrder(orderId) {
  const res = await wcRequest("GET", `/orders/${orderId}`);
  return res.status === 200 ? res.body : null;
}

// Update order status
async function updateOrderStatus(orderId, status) {
  return wcRequest("PUT", `/orders/${orderId}`, { status });
}

// Register webhook in WooCommerce
async function registerWebhook(deliveryUrl, secret = process.env.WC_WEBHOOK_SECRET || "thc_webhook_2024") {
  return wcRequest("POST", "/webhooks", {
    name        : "MGT Order Sync",
    topic       : "order.created",
    delivery_url: deliveryUrl,
    secret,
    status      : "active",
  });
}

module.exports = { getAllProducts, getOrders, getOrder, updateStock, updateOrderStatus, registerWebhook, wcRequest };
