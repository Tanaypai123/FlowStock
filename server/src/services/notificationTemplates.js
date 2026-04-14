/**
 * notificationTemplates.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure functions that return formatted notification message strings.
 * No external dependencies — just string templates.
 *
 * Used by notificationService.js to send via WhatsApp / SMS.
 */

/**
 * Sent when an admin confirms a customer's order.
 * @param {string} customerName
 * @param {string} orderId  — short display ID (e.g. "A1B2C3D4")
 * @returns {string}
 */
export function orderConfirmed(customerName, orderId) {
  return (
    `✅ *Order Confirmed* — FlowStock\n\n` +
    `Hello ${customerName},\n\n` +
    `Your order *#${orderId}* has been confirmed and is being prepared for dispatch.\n\n` +
    `We will notify you once your order is on the way. Thank you for choosing FlowStock! 🙏`
  );
}

/**
 * Sent when an admin dispatches an order (assigns driver + sets status = dispatched).
 * @param {string} customerName
 * @param {string} driverName
 * @returns {string}
 */
export function orderDispatched(customerName, driverName) {
  return (
    `📦 *Order Dispatched* — FlowStock\n\n` +
    `Hello ${customerName},\n\n` +
    `Your order has been dispatched with our driver *${driverName}* and will be delivered soon.\n\n` +
    `You will receive your delivery OTP when the driver is on the way. Thank you! 😊`
  );
}

/**
 * Sent when a driver clicks "Out for Delivery" — includes OTP.
 * @param {string} customerName
 * @param {string} otp
 * @returns {string}
 */
export function orderOutForDelivery(customerName, otp) {
  return (
    `🚚 *Driver is On the Way!* — FlowStock\n\n` +
    `Hello ${customerName},\n\n` +
    `Your order is *out for delivery* and the driver is heading to you now.\n\n` +
    `🔐 *Delivery OTP: ${otp}*\n\n` +
    `Please share this OTP with the driver when they arrive to confirm delivery. Do not share it with anyone else.\n\n` +
    `Thank you for choosing FlowStock! 🙏`
  );
}

/**
 * Sent when a driver marks an order as delivered (with proof photo).
 * @param {string} customerName
 * @returns {string}
 */
export function orderDelivered(customerName) {
  return (
    `✅ *Order Delivered* — FlowStock\n\n` +
    `Hello ${customerName},\n\n` +
    `Your order has been *successfully delivered*! 🎉\n\n` +
    `Thank you for your business. We hope to serve you again soon!`
  );
}

/**
 * Sent when a customer cancels their own order.
 * @param {string} customerName
 * @param {string} orderId  — short display ID
 * @returns {string}
 */
export function orderCancelled(customerName, orderId) {
  return (
    `❌ *Order Cancelled* — FlowStock\n\n` +
    `Hello ${customerName},\n\n` +
    `Your order *#${orderId}* has been cancelled as requested.\n\n` +
    `If this was a mistake or you need to place a new order, please contact us. We're here to help!`
  );
}

/**
 * Sent as an SMS alert to the admin when an inventory item falls below threshold.
 * @param {string} itemName
 * @param {number} quantity  — current stock level
 * @returns {string}
 */
export function lowStockAlert(itemName, quantity) {
  return (
    `⚠️ FlowStock LOW STOCK ALERT\n\n` +
    `Item: ${itemName}\n` +
    `Current stock: ${quantity} unit(s)\n\n` +
    `Please restock this item soon to avoid order fulfillment issues.`
  );
}
