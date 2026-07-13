import { Router, type IRouter } from "express";
import { db, leadsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

// Inbound webhook target for the n8n workflow at
// https://ravenmark.app.n8n.cloud/webhook/AppData — configure that n8n
// workflow to POST its lead JSON here.
router.post("/webhooks/leads", async (req, res) => {
  const body = req.body ?? {};

  const name =
    body.name ?? body.fullName ?? [body.firstName, body.lastName].filter(Boolean).join(" ").trim();

  if (!name) {
    return res.status(400).json({ error: "Payload must include a name (or firstName/lastName)." });
  }

  try {
    const [lead] = await db
      .insert(leadsTable)
      .values({
        name,
        email: body.email ?? null,
        phone: body.phone ?? body.phoneNumber ?? null,
        company: body.company ?? body.companyName ?? null,
        designation: body.designation ?? body.title ?? null,
        sector: body.sector ?? null,
        source: body.source ?? "n8n Webhook",
        referenceNumber: body.referenceNumber ?? body.reference ?? null,
        linkedin: body.linkedin ?? null,
        raw: JSON.stringify(body),
      })
      .returning();

    return res.status(201).json({ lead });
  } catch (err) {
    req.log?.error(err, "Failed to insert lead from webhook");
    return res.status(500).json({ error: "Failed to store lead." });
  }
});

// Consumed by the workspace-suite frontend to merge webhook-received leads
// into the Leads Database table.
router.get("/leads", async (_req, res) => {
  try {
    const leads = await db.select().from(leadsTable).orderBy(desc(leadsTable.createdAt)).limit(200);
    res.json({ leads });
  } catch (err) {
    res.status(500).json({ error: "Failed to load leads." });
  }
});

export default router;
