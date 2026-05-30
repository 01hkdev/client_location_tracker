import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SHEET_TAB = "Main";

export type SheetClient = {
  id: number;
  companyCode: string;
  companyName: string;
  locality: string;
  city: string;
  state: string;
  pinCode: string;
  latitude: number;
  longitude: number;
  fieldPerson: string;
  computerPerson: string;
  status: string;
  address: string;
  fullAddress: string;
  geoStatus: string;
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
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getClientsFromSheet(): Promise<SheetClient[]> {
  const now = Date.now();
  if (cachedClients && now - cacheTime < CACHE_TTL_MS) {
    return cachedClients;
  }

  const sheets = getSheetsClient();

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!1:1`,
  });
  const headers: string[] = (headerRes.data.values?.[0] ?? []).map((h: unknown) =>
    String(h ?? "").trim().toLowerCase()
  );

  const dataRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!2:5000`,
  });
  const rows: string[][] = (dataRes.data.values ?? []).map((row) =>
    (row as unknown[]).map((cell) => String(cell ?? "").trim())
  );

  function colIdx(names: string[]): number {
    for (const name of names) {
      const i = headers.findIndex((h) => h.includes(name.toLowerCase()));
      if (i !== -1) return i;
    }
    return -1;
  }

  const statusIdx      = colIdx(["company status"]);
  const snIdx          = colIdx(["s.no", "sno", "s.n"]);
  const codeIdx        = colIdx(["company code"]);
  const nameIdx        = colIdx(["company name"]);
  const fieldIdx       = colIdx(["field person responsible", "field person"]);
  const computerIdx    = colIdx(["computer person responsible", "computer person"]);
  const addressIdx     = colIdx(["company address"]);
  const localityIdx    = colIdx(["locality"]);
  const cityIdx        = colIdx(["area/city", "area", "city"]);
  const stateIdx       = colIdx(["state"]);
  const pinIdx         = colIdx(["pin code", "pincode"]);
  const fullAddressIdx = colIdx(["full address"]);
  const latIdx         = colIdx(["latitude"]);
  const lngIdx         = colIdx(["longitude"]);
  const geoIdx         = colIdx(["geo status"]);
  const dateIdx        = colIdx(["company work start date", "work start date"]);

  const clients: SheetClient[] = [];
  let id = 1;

  for (const row of rows) {
    const rawStatus = statusIdx >= 0 ? (row[statusIdx] ?? "").trim().toLowerCase() : "active";
    if (rawStatus === "closed") continue;
    const status = rawStatus || "active";

    const latStr = latIdx >= 0 ? (row[latIdx] ?? "") : "";
    const lngStr = lngIdx >= 0 ? (row[lngIdx] ?? "") : "";
    const lat = latStr ? Number(latStr) : 0;
    const lng = lngStr ? Number(lngStr) : 0;

    const sn = snIdx >= 0 ? row[snIdx] ?? "" : "";
    const code = codeIdx >= 0 ? row[codeIdx] ?? "" : "";
    const name = (nameIdx >= 0 ? row[nameIdx] ?? "" : "").replace(/\r/g, "").trim();
    const locality = localityIdx >= 0 ? (row[localityIdx] ?? "").trim() : "";
    const city = cityIdx >= 0 ? row[cityIdx] ?? "" : "";
    const state = stateIdx >= 0 ? row[stateIdx] ?? "" : "";
    const pinCode = pinIdx >= 0 ? row[pinIdx] ?? "" : "";
    const address = addressIdx >= 0 ? row[addressIdx] ?? "" : "";
    const fullAddress = fullAddressIdx >= 0 ? row[fullAddressIdx] ?? "" : "";
    const geoStatus = geoIdx >= 0 ? row[geoIdx] ?? "" : "";
    const fieldPerson = fieldIdx >= 0 ? row[fieldIdx] ?? "" : "";
    const computerPerson = computerIdx >= 0 ? row[computerIdx] ?? "" : "";
    const createdAtRaw = dateIdx >= 0 ? row[dateIdx] ?? "" : "";

    if (!code && !name && !city) continue;

    const finalCode = code || (sn ? `SN${sn.padStart(3, "0")}` : `CLT${String(id).padStart(3, "0")}`);
    const finalName = name || `${city} Client ${sn || id}`;

    let createdAt = new Date().toISOString();
    if (createdAtRaw) {
      const parsed = new Date(createdAtRaw);
      if (!isNaN(parsed.getTime())) createdAt = parsed.toISOString();
    }

    clients.push({
      id: id++,
      companyCode: finalCode,
      companyName: finalName,
      locality,
      city,
      state,
      pinCode,
      latitude: isNaN(lat) ? 0 : lat,
      longitude: isNaN(lng) ? 0 : lng,
      fieldPerson,
      computerPerson,
      status,
      address,
      fullAddress,
      geoStatus,
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
