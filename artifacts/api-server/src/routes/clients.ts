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
import { ilike, eq, sql, and } from "drizzle-orm";
import { getClientsFromSheet, clearSheetCache, type SheetClient } from "../lib/googleSheets.js";

const router: IRouter = Router();

const USE_SHEET = !!process.env.GOOGLE_SHEET_ID && !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

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

function sheetClientToApi(c: SheetClient) {
  return {
    id: c.id,
    companyCode: c.companyCode,
    companyName: c.companyName,
    locality: c.locality,
    city: c.city,
    state: c.state,
    pinCode: c.pinCode,
    latitude: c.latitude,
    longitude: c.longitude,
    fieldPerson: c.fieldPerson,
    computerPerson: c.computerPerson,
    status: c.status,
    createdAt: c.createdAt,
    address: c.address,
    fullAddress: c.fullAddress,
    geoStatus: c.geoStatus,
  };
}

router.get("/clients", async (req, res): Promise<void> => {
  const parsed = ListClientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { city, pinCode, status, locality } = parsed.data;

  if (USE_SHEET) {
    try {
      let clients = await getClientsFromSheet();
      if (locality) clients = clients.filter((c) => c.locality.toLowerCase().includes(locality.toLowerCase()));
      else if (city) clients = clients.filter((c) => c.city.toLowerCase().includes(city.toLowerCase()));
      else if (pinCode) clients = clients.filter((c) => c.pinCode === pinCode);
      else if (status) clients = clients.filter((c) => c.status === status);
      res.json(clients.map((c) => ListClientsResponseItem.parse(sheetClientToApi(c))));
      return;
    } catch (err) {
      req.log.error({ err }, "Google Sheets fetch failed, falling back to DB");
    }
  }

  let query = db.select().from(clientsTable).$dynamic();
  if (locality) query = query.where(ilike(clientsTable.locality, `%${locality}%`));
  else if (city) query = query.where(ilike(clientsTable.city, `%${city}%`));
  else if (pinCode) query = query.where(eq(clientsTable.pinCode, pinCode));
  else if (status) query = query.where(eq(clientsTable.status, status));

  const clients = await query;
  res.json(clients.map((c) => ListClientsResponseItem.parse({ ...c, createdAt: c.createdAt?.toISOString() })));
});

router.get("/clients/stats", async (req, res): Promise<void> => {
  if (USE_SHEET) {
    try {
      const clients = await getClientsFromSheet();
      const cityMap: Record<string, number> = {};
      const statusMap: Record<string, number> = {};
      const stateMap: Record<string, number> = {};
      const localityMap: Record<string, number> = {};
      for (const c of clients) {
        cityMap[c.city] = (cityMap[c.city] ?? 0) + 1;
        statusMap[c.status] = (statusMap[c.status] ?? 0) + 1;
        stateMap[c.state] = (stateMap[c.state] ?? 0) + 1;
        const localityKey = c.locality || "Locality Not Updated";
        localityMap[localityKey] = (localityMap[localityKey] ?? 0) + 1;
      }
      const byCity = Object.entries(cityMap)
        .sort((a, b) => b[1] - a[1])
        .map(([city, count]) => ({ city, count }));
      const byStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));
      const byState = Object.entries(stateMap)
        .sort((a, b) => b[1] - a[1])
        .map(([state, count]) => ({ state, count }));
      const byLocality = Object.entries(localityMap)
        .sort((a, b) => b[1] - a[1])
        .map(([locality, count]) => ({ locality, count }));

      res.json(GetClientStatsResponse.parse({ total: clients.length, byCity, byStatus, byState, byLocality }));
      return;
    } catch (err) {
      req.log.error({ err }, "Google Sheets stats failed, falling back to DB");
    }
  }

  const [total, byCity, byStatus, byState, byLocality] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(clientsTable),
    db.select({ city: clientsTable.city, count: sql<number>`count(*)::int` }).from(clientsTable).groupBy(clientsTable.city).orderBy(sql`count(*) desc`),
    db.select({ status: clientsTable.status, count: sql<number>`count(*)::int` }).from(clientsTable).groupBy(clientsTable.status),
    db.select({ state: clientsTable.state, count: sql<number>`count(*)::int` }).from(clientsTable).groupBy(clientsTable.state).orderBy(sql`count(*) desc`),
    db.select({ locality: clientsTable.locality, count: sql<number>`count(*)::int` }).from(clientsTable).groupBy(clientsTable.locality).orderBy(sql`count(*) desc`),
  ]);
  res.json(GetClientStatsResponse.parse({
    total: total[0]?.count ?? 0,
    byCity: byCity.map((r) => ({ city: r.city, count: r.count })),
    byStatus: byStatus.map((r) => ({ status: r.status, count: r.count })),
    byState: byState.map((r) => ({ state: r.state, count: r.count })),
    byLocality: byLocality.map((r) => ({ locality: r.locality || "Locality Not Updated", count: r.count })),
  }));
});

router.get("/clients/nearby", async (req, res): Promise<void> => {
  const parsed = GetNearbyClientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { lat, lng, radius = 50 } = parsed.data;

  if (USE_SHEET) {
    try {
      const clients = await getClientsFromSheet();
      const nearby = clients
        .map((c) => ({ ...c, distanceKm: haversineKm(lat, lng, c.latitude, c.longitude) }))
        .filter((c) => c.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      res.json(nearby.map((c) => GetNearbyClientsResponseItem.parse({ ...sheetClientToApi(c), distanceKm: c.distanceKm })));
      return;
    } catch (err) {
      req.log.error({ err }, "Google Sheets nearby failed, falling back to DB");
    }
  }

  const clients = await db.select().from(clientsTable);
  const nearby = clients
    .map((c) => ({ ...c, distanceKm: haversineKm(lat, lng, c.latitude, c.longitude) }))
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

  if (USE_SHEET) {
    try {
      const clients = await getClientsFromSheet();
      const client = clients.find((c) => c.id === params.data.id);
      if (!client) { res.status(404).json({ error: "Client not found" }); return; }
      res.json(GetClientResponse.parse(sheetClientToApi(client)));
      return;
    } catch (err) {
      req.log.error({ err }, "Google Sheets get-by-id failed, falling back to DB");
    }
  }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, params.data.id));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  res.json(GetClientResponse.parse({ ...client, createdAt: client.createdAt?.toISOString() }));
});

router.post("/admin/refresh", async (req, res) => {
  if (!USE_SHEET) {
    res.status(400).json({ error: "Google Sheets not configured" });
    return;
  }
  clearSheetCache();
  try {
    await getClientsFromSheet();
    res.json({ ok: true, message: "Sheet cache refreshed successfully" });
  } catch (err) {
    req.log.error({ err }, "Failed to refresh sheet cache");
    res.status(500).json({ error: "Failed to refresh data from sheet" });
  }
});

export default router;
