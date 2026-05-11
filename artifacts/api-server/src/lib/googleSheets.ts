import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_TAB = "Main";

export type SheetClient = {
  id: number;
  companyCode: string;
  companyName: string;
  city: string;
  state: string;
  pinCode: string;
  latitude: number;
  longitude: number;
  fieldPerson: string;
  status: string;
  address: string;
  createdAt: string;
};

function getSheetsClient() {
  const rawCreds = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawCreds) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON env var is not set");
  const creds = JSON.parse(rawCreds);
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

let cachedClients: SheetClient[] | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function getClientsFromSheet(): Promise<SheetClient[]> {
  const now = Date.now();
  if (cachedClients && now - cacheTime < CACHE_TTL_MS) {
    return cachedClients;
  }

  const sheets = getSheetsClient();

  // Fetch header row first to build column map
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!1:1`,
  });
  const headers: string[] = (headerRes.data.values?.[0] ?? []).map((h: unknown) =>
    String(h ?? "").trim().toLowerCase()
  );

  // Fetch all data rows (up to 2000)
  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!2:2000`,
  });
  const rows: string[][] = (dataRes.data.values ?? []).map((row) =>
    (row as unknown[]).map((cell) => String(cell ?? "").trim())
  );

  // Build column index map
  function colIdx(names: string[]): number {
    for (const name of names) {
      const i = headers.findIndex((h) => h.includes(name));
      if (i !== -1) return i;
    }
    return -1;
  }

  const latIdx = colIdx(["latitude", "lat"]);
  const lngIdx = colIdx(["longitude", "lng", "long"]);
  const cityIdx = colIdx(["city"]);
  const stateIdx = colIdx(["state"]);
  const pinIdx = colIdx(["pin code", "pincode", "pin"]);
  const addressIdx = colIdx(["company address", "address"]);
  const geoStatusIdx = colIdx(["geo status"]);
  const nameIdx = colIdx(["company name", "firm name", "name"]);
  const codeIdx = colIdx(["company code", "code", "sr no", "srno", "s.no"]);
  const personIdx = colIdx(["follow", "field person", "person", "handled"]);
  const statusIdx = colIdx(["status"]);
  const dateIdx = colIdx(["date", "last operated"]);

  const clients: SheetClient[] = [];
  let id = 1;

  for (const row of rows) {
    const lat = parseFloat(row[latIdx] ?? "");
    const lng = parseFloat(row[lngIdx] ?? "");
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) continue;

    const geoStatus = geoStatusIdx >= 0 ? row[geoStatusIdx] : "";
    // Only include rows that have been geo-located
    if (geoStatusIdx >= 0 && geoStatus && !geoStatus.toLowerCase().includes("done") && !geoStatus.toLowerCase().includes("pin")) continue;

    const city = cityIdx >= 0 ? row[cityIdx] : "";
    const state = stateIdx >= 0 ? row[stateIdx] : "";
    const pinCode = pinIdx >= 0 ? row[pinIdx] : "";
    const address = addressIdx >= 0 ? row[addressIdx] : "";
    const name = nameIdx >= 0 ? row[nameIdx] : "";
    const code = codeIdx >= 0 ? row[codeIdx] : "";
    const person = personIdx >= 0 ? row[personIdx] : "";
    const rawStatus = statusIdx >= 0 ? row[statusIdx]?.toLowerCase() : "";
    const createdAtRaw = dateIdx >= 0 ? row[dateIdx] : "";

    // Normalize status
    let status = "active";
    if (rawStatus.includes("inactive") || rawStatus.includes("close")) status = "inactive";
    else if (rawStatus.includes("prospect") || rawStatus.includes("lead")) status = "prospect";

    // Build a reasonable company code if missing
    const finalCode = code || `${city?.substring(0, 3)?.toUpperCase() ?? "CLT"}${String(id).padStart(3, "0")}`;
    const finalName = name || `${city} Client ${id}`;

    let createdAt = new Date().toISOString();
    if (createdAtRaw) {
      const parsed = new Date(createdAtRaw);
      if (!isNaN(parsed.getTime())) createdAt = parsed.toISOString();
    }

    clients.push({
      id: id++,
      companyCode: finalCode,
      companyName: finalName,
      city,
      state,
      pinCode,
      latitude: lat,
      longitude: lng,
      fieldPerson: person,
      status,
      address,
      createdAt,
    });
  }

  cachedClients = clients;
  cacheTime = now;
  return clients;
}

export function clearSheetCache() {
  cachedClients = null;
  cacheTime = 0;
}
