import { API_PREFIX } from "@flowstock/shared";
import { adminRouter } from "./admin.js";
import { healthRouter } from "./health.js";
import { inventoryRouter } from "./inventory.js";
import { ordersRouter } from "./orders.js";
import { customerOrdersRouter } from "./customerOrders.js";
import { driverRouter } from "./driverRoutes.js";
import { driverAuthRouter } from "./driverAuth.js";
import { testDbRouter } from "./test-db.js";
import { testWhatsAppRouter } from "./test-whatsapp.js";
import { complaintsRouter } from "./complaints.js";
import { businessSetupRouter } from "./businessSetup.js";
import { devRouter } from "./dev.js";
import { bugsRouter } from "./bugs.js";
import { invoicesRouter } from "./invoices.js";
import { apiLogger } from "../middleware/apiLogger.js";

/**
 * @param {import("express").Express} app
 */
export function registerRoutes(app) {
  app.use(API_PREFIX, healthRouter);
  app.use(API_PREFIX, testDbRouter);
  // ⚡ Standalone WhatsApp test — GET /api/test-whatsapp?to=+91XXXXXXXXXX
  app.use(`${API_PREFIX}/test-whatsapp`, testWhatsAppRouter);
  app.use(`${API_PREFIX}/admin`, adminRouter);
  app.use(`${API_PREFIX}/inventory`, inventoryRouter);
  app.use(`${API_PREFIX}/orders`, ordersRouter);
  app.use(`${API_PREFIX}/invoices`, invoicesRouter);
  // Customer-facing routes: /api/customer/*
  app.use(`${API_PREFIX}/customer`, customerOrdersRouter);
  // Driver auth (phone+password) — mounted BEFORE /api/driver/* to avoid conflict
  app.use(`${API_PREFIX}/driver/auth`, driverAuthRouter);
  // Driver-facing routes: /api/driver/*
  app.use(`${API_PREFIX}/driver`, driverRouter);
  // Complaints: customer POST + GET /mine, admin GET + PUT status
  app.use(`${API_PREFIX}/complaints`, complaintsRouter);
  // Business onboarding (requireAuth, not requireAdmin)
  app.use(`${API_PREFIX}/business`, businessSetupRouter);
  // Bugs: report and track issues
  app.use(`${API_PREFIX}/bugs`, bugsRouter);
  // Super admin dev console — superAdminOnly middleware applied inside devRouter
  app.use(`${API_PREFIX}/dev`, devRouter);
  // API logger — fire-and-forget, applied after all routes
  app.use(apiLogger);
}
