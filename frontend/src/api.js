const BASE = '/api';
async function api(path, opts = {}) {
  const url = BASE + path;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}
export const login         = (d)    => api("/login", { method: "POST", body: d });
export const getUsers      = ()     => api("/users");
export const addUser       = (d)    => api("/users", { method: "POST", body: d });
export const updateUser    = (id,d) => api(`/users/${id}`, { method: "PUT", body: d });
export const deleteUser    = (id)   => api(`/users/${id}`, { method: "DELETE" });
export const getProducts   = ()     => api("/products");
export const addProduct    = (d)    => api("/products", { method: "POST", body: d });
export const updateProduct = (id,d) => api(`/products/${id}`, { method: "PUT", body: d });
export const deleteProduct = (id)   => api(`/products/${id}`, { method: "DELETE" });
export const getSales      = ()     => api("/sales");
export const addSale       = (d)    => api("/sales", { method: "POST", body: d });
export const getExpenses   = ()     => api("/expenses");
export const addExpense    = (d)    => api("/expenses", { method: "POST", body: d });
export const deleteExpense = (id)   => api(`/expenses/${id}`, { method: "DELETE" });
export const getCategories = ()     => api("/categories");
export const addCategory   = (d)    => api("/categories", { method: "POST", body: d });
export const updateCategory= (id,d) => api(`/categories/${id}`, { method: "PUT", body: d });
export const deleteCategory= (id)   => api(`/categories/${id}`, { method: "DELETE" });
export const getPurchases  = ()     => api("/purchases");
export const addPurchase   = (d)    => api("/purchases", { method: "POST", body: d });
export const updatePurchaseStatus=(id,s)=>api(`/purchases/${id}/status`,{method:"PUT",body:{status:s}});
export const getStakeholders= ()   => api("/stakeholders");
export const addStakeholder = (d)  => api("/stakeholders", { method: "POST", body: d });
export const updateStakeholder=(id,d)=>api(`/stakeholders/${id}`,{method:"PUT",body:d});
export const deleteStakeholder=(id)=> api(`/stakeholders/${id}`, { method: "DELETE" });
export const addTransaction = (id,d)=> api(`/stakeholders/${id}/transactions`, { method: "POST", body: d });
export const deleteTransaction=(id)=> api(`/stakeholders/transactions/${id}`, { method: "DELETE" });

export const getDeliveries    = ()    => api("/deliveries");
export const createDelivery   = (d)   => api("/deliveries", { method: "POST", body: d });
export const syncDelivery     = (id)  => api(`/deliveries/${id}/sync`);
export const deleteDelivery   = (id)  => api(`/deliveries/${id}`, { method: "DELETE" });
export const getZones         = ()    => api("/pathao/zones");
export const cancelDelivery    = (id)  => api(`/deliveries/${id}/cancel`, { method: 'PUT' });
export const getDeliveryStats  = ()    => api('/delivery-stats');
export const sendReport = () => api('/send-report');
export const getStockHistory  = (pid) => api('/stock-history' + (pid ? '?product_id='+pid : ''));
export const getPayouts       = ()    => api('/payouts');
export const getUnpaidDeliveries = () => api('/payouts/unpaid');
export const createPayout     = (d)   => api('/payouts', { method: 'POST', body: d });
export const deletePayout     = (id)  => api(`/payouts/${id}`, { method: 'DELETE' });

// WooCommerce
export const getWCStatus       = ()  => api('/wc/status');
export const getWCOrders       = ()  => api('/wc/orders');
export const syncWCProducts    = ()  => api('/wc/sync-products', { method: 'POST' });
export const syncWCOrders      = (pages) => api('/wc/sync-orders', { method: 'POST', body: { pages } });
export const registerWCWebhook = ()  => api('/wc/register-webhook', { method: 'POST' });
export const pushStock         = (id) => api('/wc/push-stock/'+id, { method: 'POST' });
export const updateSale = (id, d) => api('/sales/'+id, { method: 'PUT', body: d });
export const deleteSale  = (id)    => api('/sales/'+id, { method: 'DELETE' });

// Pre-orders
export const syncPreOrders    = ()      => api('/preorders/sync', { method: 'POST' });
export const getPreOrders     = (month) => api('/preorders' + (month ? '?month='+encodeURIComponent(month) : ''));
export const getPreOrderMonths= ()      => api('/preorders/months');
export const updatePreOrderStatus=(id,d)=> api('/preorders/'+id+'/status', { method: 'PUT', body: d });
export const createPreOrderPathao=(id)  => api('/preorders/'+id+'/pathao', { method: 'POST' });
export const deletePreOrder   = (id)    => api('/preorders/'+id, { method: 'DELETE' });
export const updatePreOrder = (id, d) => api('/preorders/'+id, { method: 'PUT', body: d });

export const getPendingOrders   = ()      => api('/pending-orders');
export const approveOrder       = (id, d) => api('/pending-orders/'+id+'/approve', { method: 'POST', body: d });
export const rejectOrder        = (id)    => api('/pending-orders/'+id+'/reject', { method: 'PUT' });
export const deletePendingOrder = (id)    => api('/pending-orders/'+id, { method: 'DELETE' });
