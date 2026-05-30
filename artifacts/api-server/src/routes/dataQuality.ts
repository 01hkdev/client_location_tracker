import { Router, type IRouter } from "express";
import { getClientsFromSheet } from "../lib/googleSheets.js";

const router: IRouter = Router();

const GEOCODE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const THRESHOLD_WARN_KM = 5;
const THRESHOLD_HIGH_KM = 15;

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
let lastCheckTime = 0;
let lastResult: unknown = null;
const RESULT_CACHE_TTL_MS = 10 * 60 * 1000;

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
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodePin(pinCode: string): Promise<{ lat: number; lng: number } | null> {
  if (geocodeCache.has(pinCode)) return geocodeCache.get(pinCode)!;
  if (!GEOCODE_API_KEY) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(pinCode + " India")}&key=${GEOCODE_API_KEY}`;
    const resp = await fetch(url);
    const data = (await resp.json()) as { status: string; results?: { geometry: { location: { lat: number; lng: number } } }[] };

    if (data.status === "OK" && data.results && data.results.length > 0) {
      const loc = data.results[0].geometry.location;
      const result = { lat: loc.lat, lng: loc.lng };
      geocodeCache.set(pinCode, result);
      return result;
    }
  } catch {
    // ignore geocode failure for individual PIN
  }

  geocodeCache.set(pinCode, null);
  return null;
}

router.get("/data-quality", async (req, res): Promise<void> => {
  if (!GEOCODE_API_KEY) {
    res.status(503).json({ error: "GOOGLE_MAPS_API_KEY not configured on server" });
    return;
  }

  const now = Date.now();
  if (lastResult && now - lastCheckTime < RESULT_CACHE_TTL_MS) {
    res.json(lastResult);
    return;
  }

  const clients = await getClientsFromSheet();

  const uniquePins = [...new Set(clients.map((c) => c.pinCode).filter(Boolean))];

  for (const pin of uniquePins) {
    if (!geocodeCache.has(pin)) {
      await geocodePin(pin);
      await new Promise((r) => setTimeout(r, 60));
    }
  }

  const flagged: {
    id: number;
    companyCode: string;
    companyName: string;
    city: string;
    state: string;
    pinCode: string;
    storedLat: number;
    storedLng: number;
    expectedLat: number;
    expectedLng: number;
    distanceKm: number;
    severity: "high" | "medium";
  }[] = [];

  for (const client of clients) {
    if (!client.pinCode) continue;

    const expected = geocodeCache.get(client.pinCode);
    if (!expected) continue;

    const distKm = haversineKm(client.latitude, client.longitude, expected.lat, expected.lng);

    if (distKm > THRESHOLD_WARN_KM) {
      flagged.push({
        id: client.id,
        companyCode: client.companyCode,
        companyName: client.companyName,
        city: client.city,
        state: client.state,
        pinCode: client.pinCode,
        storedLat: client.latitude,
        storedLng: client.longitude,
        expectedLat: expected.lat,
        expectedLng: expected.lng,
        distanceKm: Math.round(distKm * 10) / 10,
        severity: distKm >= THRESHOLD_HIGH_KM ? "high" : "medium",
      });
    }
  }

  flagged.sort((a, b) => b.distanceKm - a.distanceKm);

  const result = {
    totalChecked: clients.length,
    flaggedCount: flagged.length,
    thresholdKm: THRESHOLD_WARN_KM,
    checkedAt: new Date().toISOString(),
    items: flagged,
  };

  lastResult = result;
  lastCheckTime = now;

  res.json(result);
});

export default router;
