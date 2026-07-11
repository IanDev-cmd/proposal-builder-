import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Leads received through the inbound webhook (see artifacts/api-server
// POST /api/webhooks/leads). Kept intentionally minimal — extend as the
// n8n payload shape solidifies.
export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  designation: text("designation"),
  sector: text("sector"),
  source: text("source"),
  referenceNumber: text("reference_number"),
  linkedin: text("linkedin"),
  raw: text("raw"), // full original JSON payload, for anything not yet mapped
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true, createdAt: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
