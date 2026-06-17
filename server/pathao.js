const https = require("https");

const BASE = "https://api-hermes.pathao.com";
let _token = null;
let _tokenExpiry = 0;

async function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(BASE + path);
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

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;
  const res = await request("POST", "/aladdin/api/v1/issue-token", {
    client_id    : process.env.PATHAO_CLIENT_ID,
    client_secret: process.env.PATHAO_CLIENT_SECRET,
    username     : process.env.PATHAO_USERNAME,
    password     : process.env.PATHAO_PASSWORD,
    grant_type   : "password",
  });
  if (res.status !== 200 || !res.body.access_token)
    throw new Error("Pathao auth failed: " + JSON.stringify(res.body));
  _token = res.body.access_token;
  _tokenExpiry = Date.now() + (res.body.expires_in - 60) * 1000;
  return _token;
}

async function createOrder(order) {
  const token = await getToken();
  const res = await request("POST", "/aladdin/api/v1/orders", {
    store_id          : parseInt(process.env.PATHAO_STORE_ID),
    merchant_order_id : order.merchant_order_id,
    sender_name       : process.env.PATHAO_SENDER_NAME,
    sender_phone      : process.env.PATHAO_SENDER_PHONE,
    recipient_name    : order.recipient_name,
    recipient_phone   : order.recipient_phone,
    recipient_address : order.recipient_address,
    recipient_city    : parseInt(process.env.PATHAO_CITY_ID),
    recipient_zone    : parseInt(process.env.PATHAO_ZONE_ID),
    delivery_type     : 48,  // normal delivery
    item_type         : 2,   // parcel
    special_instruction: order.note || "",
    item_quantity     : order.item_quantity || 1,
    item_weight       : order.item_weight || 0.5,
    amount_to_collect : order.amount_to_collect,
    item_description  : order.item_description || "",
  }, token);
  return res;
}

async function getOrderStatus(consignment_id) {
  const token = await getToken();
  const res = await request("GET", `/aladdin/api/v1/orders/${consignment_id}`, null, token);
  return res;
}

async function getCityList() {
  const token = await getToken();
  return request("GET", "/aladdin/api/v1/countries/1/city-list", null, token);
}

async function getZoneList(city_id) {
  const token = await getToken();
  return request("GET", `/aladdin/api/v1/cities/${city_id}/zone-list`, null, token);
}

module.exports = { createOrder, getOrderStatus, getCityList, getZoneList, getToken };
