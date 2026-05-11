import { Router, type IRouter } from "express";
import { db, clientsTable } from "@workspace/db";
import {
  ListClientsQueryParams,
  GetNearbyClientsQueryParams,
  GetClientParams,
  GetClientStatsResponse,
  GetNearbyClientsResponseItem,
  ListClientsResponseItem,
  GetClientResponse,
} from "@workspace/api-zod";
import { ilike, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

router.get("/clients", async (req, res): Promise<void> => {
  const parsed = ListClientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { city, pinCode, status } = parsed.data;

  let query = db.select().from(clientsTable).$dynamic();

  if (city) {
    query = query.where(ilike(clientsTable.city, `%${city}%`));
  } else if (pinCode) {
    query = query.where(eq(clientsTable.pinCode, pinCode));
  } else if (status) {
    query = query.where(eq(clientsTable.status, status));
  }

  const clients = await query;
  res.json(clients.map((c) => ListClientsResponseItem.parse({ ...c, createdAt: c.createdAt?.toISOString() })));
});

router.get("/clients/stats", async (_req, res): Promise<void> => {
  const [total, byCity, byStatus] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(clientsTable),
    db
      .select({ city: clientsTable.city, count: sql<number>`count(*)::int` })
      .from(clientsTable)
      .groupBy(clientsTable.city)
      .orderBy(sql`count(*) desc`),
    db
      .select({ status: clientsTable.status, count: sql<number>`count(*)::int` })
      .from(clientsTable)
      .groupBy(clientsTable.status),
  ]);

  const stats = GetClientStatsResponse.parse({
    total: total[0]?.count ?? 0,
    byCity: byCity.map((r) => ({ city: r.city, count: r.count })),
    byStatus: byStatus.map((r) => ({ status: r.status, count: r.count })),
  });

  res.json(stats);
});

router.get("/clients/nearby", async (req, res): Promise<void> => {
  const parsed = GetNearbyClientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { lat, lng, radius = 10 } = parsed.data;

  const clients = await db.select().from(clientsTable);

  const nearby = clients
    .map((c) => ({
      ...c,
      distanceKm: haversineKm(lat, lng, c.latitude, c.longitude),
    }))
    .filter((c) => c.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  res.json(nearby.map((c) => GetNearbyClientsResponseItem.parse({ ...c, createdAt: c.createdAt?.toISOString() })));
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetClientParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [client] = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.id, params.data.id));

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json(GetClientResponse.parse({ ...client, createdAt: client.createdAt?.toISOString() }));
});

export default router;
