const https = require("https");

const DEFAULT_BASE = "https://api-hermes.pathao.com";

// Per-tenant integration config, falling back to env vars so the original single
// tenant (thc) keeps working with no settings row. Callers pass a cfg built from
// that tenant's `settings` row (see pathaoConfig() in index.js).
function envConfig() {
  return {
    base_url     : process.env.PATHAO_BASE_URL || DEFAULT_BASE,
    client_id    : process.env.PATHAO_CLIENT_ID,
    client_secret: process.env.PATHAO_CLIENT_SECRET,
    username     : process.env.PATHAO_USERNAME,
    password     : process.env.PATHAO_PASSWORD,
    store_id     : process.env.PATHAO_STORE_ID,
    sender_name  : process.env.PATHAO_SENDER_NAME,
    sender_phone : process.env.PATHAO_SENDER_PHONE,
    city_id      : process.env.PATHAO_CITY_ID || 1,
    zone_id      : process.env.PATHAO_ZONE_ID || 57,
  };
}
const cfgOf = (cfg) => ({ ...envConfig(), ...(cfg || {}) });

async function request(base, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(base + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res) => {
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

// Token cache keyed by client_id so tenants don't share each other's tokens
const _tokens = new Map();
async function getToken(cfg) {
  const c = cfgOf(cfg);
  const cached = _tokens.get(c.client_id);
  if (cached && Date.now() < cached.expiry) return cached.token;
  const res = await request(c.base_url, "POST", "/aladdin/api/v1/issue-token", {
    client_id    : c.client_id,
    client_secret: c.client_secret,
    username     : c.username,
    password     : c.password,
    grant_type   : "password",
  });
  if (res.status !== 200 || !res.body.access_token)
    throw new Error("Pathao auth failed: " + JSON.stringify(res.body));
  _tokens.set(c.client_id, { token: res.body.access_token, expiry: Date.now() + (res.body.expires_in - 60) * 1000 });
  return res.body.access_token;
}

async function createOrder(order, cfg) {
  const c = cfgOf(cfg);
  const token = await getToken(c);
  return request(c.base_url, "POST", "/aladdin/api/v1/orders", {
    store_id          : parseInt(c.store_id),
    merchant_order_id : order.merchant_order_id,
    sender_name       : c.sender_name,
    sender_phone      : c.sender_phone,
    recipient_name    : order.recipient_name,
    recipient_phone   : order.recipient_phone,
    recipient_address : order.recipient_address,
    recipient_city    : parseInt(c.city_id),
    recipient_zone    : parseInt(c.zone_id),
    delivery_type     : 48,  // normal delivery
    item_type         : 2,   // parcel
    special_instruction: order.note || "",
    item_quantity     : order.item_quantity || 1,
    item_weight       : order.item_weight || 0.5,
    amount_to_collect : order.amount_to_collect,
    item_description  : order.item_description || "",
  }, token);
}

async function getOrderStatus(consignment_id, cfg) {
  const c = cfgOf(cfg);
  const token = await getToken(c);
  return request(c.base_url, "GET", `/aladdin/api/v1/orders/${consignment_id}`, null, token);
}

async function getCityList(cfg) {
  const c = cfgOf(cfg);
  const token = await getToken(c);
  return request(c.base_url, "GET", "/aladdin/api/v1/countries/1/city-list", null, token);
}

async function getZoneList(city_id, cfg) {
  const c = cfgOf(cfg);
  const token = await getToken(c);
  return request(c.base_url, "GET", `/aladdin/api/v1/cities/${city_id}/zone-list`, null, token);
}

module.exports = { createOrder, getOrderStatus, getCityList, getZoneList, getToken };
