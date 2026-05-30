import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { useListClients, useGetNearbyClients, useGetClientStats } from "@workspace/api-client-react";
import {
  Search, MapPin, Navigation,
  X, Loader2, BarChart2,
  Car, Bike, ExternalLink, Clock, Route, User, Monitor, Building2,
  Users, Hash, FileText,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

type Client = {
  id: number;
  companyCode: string;
  companyName: string;
  locality?: string;
  city: string;
  state: string;
  pinCode: string;
  latitude: number;
  longitude: number;
  fieldPerson: string;
  computerPerson?: string;
  status: string;
  createdAt?: string;
  address?: string;
  fullAddress?: string;
  geoStatus?: string;
};
type ClientWithDistance = Client & { distanceKm: number };

type Suggestion =
  | { type: "client"; label: string; client: Client }
  | { type: "city"; label: string }
  | { type: "state"; label: string }
  | { type: "field"; label: string }
  | { type: "computer"; label: string }
  | { type: "pin"; label: string }
  | { type: "locality"; label: string };

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
  v: "weekly",
});

const DELHI = { lat: 28.6139, lng: 77.2090 };

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbeafe" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f8fafc" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2e8f0" }, { weight: 0.5 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }, { weight: 1 }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#94a3b8" }, { weight: 1.5 }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#cbd5e1" }, { weight: 0.8 }] },
  { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

const STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  closed: "#ef4444",
  nil: "#94a3b8",
  hold: "#f97316",
  prospect: "#f59e0b",
  office: "#3b82f6",
  inactive: "#94a3b8",
};

function makeMarkerIcon(
  isSelected: boolean,
  _isNearby: boolean,
  status: string,
  name: string
): google.maps.Icon {
  const pinW = isSelected ? 38 : 28;
  const pinR = pinW / 2;
  const tailH = Math.round(pinW * 0.45);
  const topPad = isSelected ? 5 : 3;
  const textH = 14;
  const gap = 3;
  const shortName = name.length > 15 ? name.substring(0, 14) + "…" : name;

  const tmpC = document.createElement("canvas");
  const tmpCtx = tmpC.getContext("2d")!;
  tmpCtx.font = `bold 9px Inter, Arial, sans-serif`;
  const tw = tmpCtx.measureText(shortName).width + 10;

  const canvasW = Math.max(pinW + 8, tw + 6);
  const canvasH = topPad + pinW + tailH + gap + textH + 4;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  const cx = canvasW / 2;
  const cy = topPad + pinR; // center of circle part
  const tipY = topPad + pinW + tailH; // pointed tip y

  const fillColor = isSelected ? "#f59e0b" : (STATUS_COLORS[status.toLowerCase()] ?? "#6366f1");

  // Glow ring for selected
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(cx, cy, pinR + 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(251,191,36,0.2)";
    ctx.fill();
  }

  // Shadow
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;

  // Teardrop shape
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(
    cx - pinR * 0.6, cy + pinR * 0.8,
    cx - pinR, cy,
    cx - pinR, cy
  );
  ctx.arc(cx, cy, pinR, Math.PI, 0);
  ctx.bezierCurveTo(
    cx + pinR, cy,
    cx + pinR * 0.6, cy + pinR * 0.8,
    cx, tipY
  );
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // White border
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(cx - pinR * 0.6, cy + pinR * 0.8, cx - pinR, cy, cx - pinR, cy);
  ctx.arc(cx, cy, pinR, Math.PI, 0);
  ctx.bezierCurveTo(cx + pinR, cy, cx + pinR * 0.6, cy + pinR * 0.8, cx, tipY);
  ctx.closePath();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = isSelected ? 2.5 : 2;
  ctx.stroke();

  // Inner white circle dot
  ctx.beginPath();
  ctx.arc(cx, cy, pinR * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();

  // Name label below
  const labelY = tipY + gap;
  const labelW = Math.min(tw, canvasW - 2);
  const lx = cx - labelW / 2;
  ctx.fillStyle = "rgba(15,23,42,0.82)";
  const lr = 4;
  ctx.beginPath();
  ctx.moveTo(lx + lr, labelY);
  ctx.lineTo(lx + labelW - lr, labelY);
  ctx.quadraticCurveTo(lx + labelW, labelY, lx + labelW, labelY + lr);
  ctx.lineTo(lx + labelW, labelY + textH - lr);
  ctx.quadraticCurveTo(lx + labelW, labelY + textH, lx + labelW - lr, labelY + textH);
  ctx.lineTo(lx + lr, labelY + textH);
  ctx.quadraticCurveTo(lx, labelY + textH, lx, labelY + textH - lr);
  ctx.lineTo(lx, labelY + lr);
  ctx.quadraticCurveTo(lx, labelY, lx + lr, labelY);
  ctx.closePath();
  ctx.fill();

  ctx.font = `bold 9px Inter, Arial, sans-serif`;
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(shortName, cx, labelY + textH / 2);

  return {
    url: canvas.toDataURL(),
    scaledSize: new google.maps.Size(canvasW, canvasH),
    anchor: new google.maps.Point(cx, tipY),
  };
}

function GeoStatusBadge({ geoStatus }: { geoStatus?: string }) {
  if (!geoStatus) return null;
  const gs = geoStatus.toLowerCase();
  if (gs.includes("done")) return null;
  if (gs.includes("failed")) {
    return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-500 border border-red-100">📍 Failed</span>;
  }
  if (gs.includes("pending")) {
    return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-600 border border-amber-100">⏳ Pending</span>;
  }
  return null;
}

function ClientCard({ client, onClick, selected, distance }: {
  client: Client; onClick: () => void; selected: boolean; distance?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-xl border transition-all duration-150 mb-1.5 ${
        selected
          ? "border-amber-400 bg-amber-50 shadow-sm"
          : "border-slate-100 hover:border-slate-200 hover:bg-slate-50 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-800 truncate leading-snug">{client.companyName}</p>
          <p className="text-[10px] text-slate-400 mt-0.5 font-mono tracking-wide">{client.companyCode}</p>
          <div className="flex items-center gap-1 mt-1.5">
            <MapPin className="h-2.5 w-2.5 text-slate-400 shrink-0" />
            <span className="text-[11px] text-slate-500 truncate">
              {client.locality ? `${client.locality} · ` : ""}{client.city}{client.state ? `, ${client.state}` : ""}
            </span>
          </div>
          {client.fullAddress && (
            <p className="text-[10px] text-slate-400 truncate mt-0.5 pl-0.5">{client.fullAddress}</p>
          )}
          <div className="flex gap-2 mt-1 flex-wrap items-center">
            <GeoStatusBadge geoStatus={client.geoStatus} />
            {client.fieldPerson && (
              <p className="text-[10px] text-slate-400 truncate">
                <span className="text-slate-300 font-medium">Field:</span> {client.fieldPerson}
              </p>
            )}
            {client.computerPerson && (
              <p className="text-[10px] text-slate-400 truncate">
                <span className="text-slate-300 font-medium">PC:</span> {client.computerPerson}
              </p>
            )}
          </div>
        </div>
        {distance !== undefined && (
          <span className="text-[11px] font-bold text-amber-600 tabular-nums shrink-0 pt-0.5">{distance.toFixed(1)} km</span>
        )}
      </div>
    </button>
  );
}

export default function MapPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [committedSearch, setCommittedSearch] = useState("Delhi");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [localFilterClients, setLocalFilterClients] = useState<Client[] | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");
  const [showStats, setShowStats] = useState(false);
  const [geoStatusFilter, setGeoStatusFilter] = useState<"all" | "done" | "failed" | "pending">("all");
  const [localityFilter, setLocalityFilter] = useState<string>("");
  const [navMode, setNavMode] = useState<"DRIVING" | "TWO_WHEELER" | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string; mode: string } | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [navError, setNavError] = useState<string | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const clustererRef = useRef<import("@googlemaps/markerclusterer").MarkerClusterer | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  const apiFilterParams = useMemo(() => {
    if (userLocation) return {};
    if (localityFilter) return { locality: localityFilter };
    if (!committedSearch) return {};
    return /^\d{6}$/.test(committedSearch.trim())
      ? { pinCode: committedSearch.trim() }
      : { city: committedSearch.trim() };
  }, [committedSearch, userLocation, localityFilter]);

  const { data: rawClients, isLoading: clientsLoading } = useListClients(apiFilterParams);
  const { data: allClientsData } = useListClients(
    {},
    { query: { staleTime: 5 * 60 * 1000, queryKey: ["clients-all-suggestions"] } }
  );
  const { data: stats, isLoading: statsLoading } = useGetClientStats();
  const { data: nearbyClients, isLoading: nearbyLoading } = useGetNearbyClients(
    { lat: userLocation?.lat ?? 0, lng: userLocation?.lng ?? 0, radius: 50 },
    { query: { enabled: !!userLocation, queryKey: ["nearby", userLocation] } }
  );

  const allDisplayClients: (Client | ClientWithDistance)[] = useMemo(() => {
    if (localFilterClients) return localFilterClients;
    return userLocation
      ? (Array.isArray(nearbyClients) ? nearbyClients : [])
      : (Array.isArray(rawClients) ? rawClients : []);
  }, [userLocation, nearbyClients, rawClients, localFilterClients]);

  const listClients: (Client | ClientWithDistance)[] = useMemo(() => {
    if (geoStatusFilter === "all") return allDisplayClients;
    return allDisplayClients.filter((c) => {
      const gs = ((c as Client).geoStatus ?? "").toLowerCase();
      if (geoStatusFilter === "done") return gs.includes("done");
      if (geoStatusFilter === "failed") return gs.includes("failed");
      if (geoStatusFilter === "pending") return gs.includes("pending");
      return true;
    });
  }, [allDisplayClients, geoStatusFilter]);

  const mappableClients: (Client | ClientWithDistance)[] = useMemo(() => {
    return allDisplayClients.filter((c) => {
      const hasCoords = c.latitude !== 0 && c.longitude !== 0 && !isNaN(c.latitude) && !isNaN(c.longitude);
      const gs = ((c as Client).geoStatus ?? "").toLowerCase();
      const geoOk = gs === "" || gs.includes("done");
      return hasCoords && geoOk;
    });
  }, [allDisplayClients]);

  // Build smart suggestions from typed query
  const suggestions: Suggestion[] = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2 || !allClientsData) return [];
    const clients = allClientsData as Client[];
    const isPinSearch = /^\d+$/.test(q);

    const clientMatches: Suggestion[] = [];
    const citySet = new Set<string>();
    const stateSet = new Set<string>();
    const fieldSet = new Set<string>();
    const computerSet = new Set<string>();
    const pinSet = new Set<string>();
    const localitySet = new Set<string>();

    for (const c of clients) {
      if (!isPinSearch && c.companyName.toLowerCase().includes(q) && clientMatches.length < 5)
        clientMatches.push({ type: "client", label: c.companyName, client: c });
      if (!isPinSearch && c.city.toLowerCase().includes(q)) citySet.add(c.city);
      if (!isPinSearch && c.state.toLowerCase().includes(q)) stateSet.add(c.state);
      if (!isPinSearch && c.fieldPerson && c.fieldPerson.toLowerCase().includes(q)) fieldSet.add(c.fieldPerson);
      if (!isPinSearch && c.computerPerson && c.computerPerson.toLowerCase().includes(q)) computerSet.add(c.computerPerson);
      if (c.pinCode && c.pinCode.includes(q)) pinSet.add(c.pinCode);
      if (!isPinSearch && c.locality && c.locality.toLowerCase().includes(q)) localitySet.add(c.locality);
      if (!isPinSearch && c.address && c.address.toLowerCase().includes(q) && clientMatches.length < 5)
        clientMatches.push({ type: "client", label: c.companyName, client: c });
      if (!isPinSearch && c.fullAddress && c.fullAddress.toLowerCase().includes(q) && clientMatches.length < 5)
        clientMatches.push({ type: "client", label: c.companyName, client: c });
    }

    const result: Suggestion[] = [...clientMatches];
    for (const loc of [...localitySet].slice(0, 4)) result.push({ type: "locality", label: loc });
    for (const pin of [...pinSet].slice(0, 5)) result.push({ type: "pin", label: pin });
    for (const city of [...citySet].slice(0, 4)) result.push({ type: "city", label: city });
    for (const state of [...stateSet].slice(0, 3)) result.push({ type: "state", label: state });
    for (const p of [...fieldSet].slice(0, 3)) result.push({ type: "field", label: p });
    for (const p of [...computerSet].slice(0, 3)) result.push({ type: "computer", label: p });
    return result.slice(0, 14);
  }, [searchQuery, allClientsData]);

  const handleSuggestionClick = (s: Suggestion) => {
    setShowSuggestions(false);
    if (s.type === "client") {
      setLocalFilterClients(null);
      setLocalityFilter("");
      setSearchQuery(s.client.city);
      setCommittedSearch(s.client.city);
      setUserLocation(null);
      setSelectedClient(s.client);
      setMobileTab("map");
    } else if (s.type === "locality") {
      setLocalityFilter(s.label);
      setLocalFilterClients(null);
      setSearchQuery(s.label);
      setUserLocation(null);
      setSelectedClient(null);
    } else if (s.type === "city") {
      setLocalFilterClients(null);
      setLocalityFilter("");
      setSearchQuery(s.label);
      setCommittedSearch(s.label);
      setUserLocation(null);
      setSelectedClient(null);
    } else if (s.type === "state") {
      const filtered = (allClientsData as Client[]).filter(
        (c) => c.state.toLowerCase() === s.label.toLowerCase()
      );
      setLocalFilterClients(filtered);
      setLocalityFilter("");
      setSearchQuery(s.label);
      setUserLocation(null);
      setSelectedClient(null);
    } else if (s.type === "field") {
      const filtered = (allClientsData as Client[]).filter(
        (c) => c.fieldPerson.toLowerCase() === s.label.toLowerCase()
      );
      setLocalFilterClients(filtered);
      setLocalityFilter("");
      setSearchQuery(s.label);
      setUserLocation(null);
      setSelectedClient(null);
    } else if (s.type === "computer") {
      const filtered = (allClientsData as Client[]).filter(
        (c) => (c.computerPerson ?? "").toLowerCase() === s.label.toLowerCase()
      );
      setLocalFilterClients(filtered);
      setLocalityFilter("");
      setSearchQuery(s.label);
      setUserLocation(null);
      setSelectedClient(null);
    } else if (s.type === "pin") {
      const filtered = (allClientsData as Client[]).filter(
        (c) => c.pinCode === s.label
      );
      setLocalFilterClients(filtered);
      setLocalityFilter("");
      setSearchQuery(s.label);
      setUserLocation(null);
      setSelectedClient(null);
    }
  };

  const updateMarkers = useCallback(async (
    list: (Client | ClientWithDistance)[],
    selected: Client | null,
    hasUserLoc: boolean
  ) => {
    if (!googleMapRef.current || typeof google === "undefined" || !google.maps) return;

    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];
    if (clustererRef.current) { clustererRef.current.clearMarkers(); clustererRef.current = null; }
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (!list.length) return;

    const { MarkerClusterer } = await import("@googlemaps/markerclusterer");

    const cityGroups = new Map<string, { lat: number; lng: number; count: number }>();
    list.forEach((c) => {
      const key = `${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`;
      if (!cityGroups.has(key)) cityGroups.set(key, { lat: c.latitude, lng: c.longitude, count: 0 });
      cityGroups.get(key)!.count++;
    });

    cityGroups.forEach(({ lat, lng, count }) => {
      const circle = new google.maps.Circle({
        center: { lat, lng },
        radius: 900 + count * 500,
        fillColor: "#10b981",
        fillOpacity: 0.10,
        strokeColor: "#059669",
        strokeOpacity: 0.30,
        strokeWeight: 1.5,
        map: googleMapRef.current!,
        zIndex: 0,
      });
      circlesRef.current.push(circle);
    });

    const bounds = new google.maps.LatLngBounds();
    const newMarkers = list.map((client) => {
      const isNearby = hasUserLoc && "distanceKm" in client;
      const isSelected = selected?.id === client.id;
      const icon = makeMarkerIcon(isSelected, isNearby, client.status, client.companyName);
      const marker = new google.maps.Marker({
        position: { lat: client.latitude, lng: client.longitude },
        title: client.companyName,
        icon,
        zIndex: isSelected ? 200 : isNearby ? 50 : 10,
      });
      bounds.extend({ lat: client.latitude, lng: client.longitude });
      marker.addListener("click", () => {
        setSelectedClient(client);
        setMobileTab("map");
        if (infoWindowRef.current && googleMapRef.current) {
          const dist = "distanceKm" in client
            ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #f1f5f9;color:#d97706;font-weight:700;font-size:11px;">📍 ${(client as ClientWithDistance).distanceKm.toFixed(1)} km away</div>` : "";
          infoWindowRef.current.setContent(`
            <div style="font-family:Inter,system-ui,sans-serif;padding:4px 2px;min-width:220px;max-width:280px;">
              <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:2px;line-height:1.3;">${client.companyName}</div>
              <div style="font-size:10px;color:#94a3b8;font-family:monospace;margin-bottom:10px;">${client.companyCode}</div>
              <div style="display:grid;gap:5px;">
                ${(client as Client).locality ? `<div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;display:inline-block;width:80px;">Locality</span>${(client as Client).locality}</div>` : ""}
                <div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;display:inline-block;width:80px;">Area/City</span>${client.city}</div>
                <div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;display:inline-block;width:80px;">State</span>${client.state}</div>
                <div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;display:inline-block;width:80px;">PIN Code</span>${client.pinCode}</div>
                ${(client as Client).address ? `<div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;display:inline-block;width:80px;">Address</span>${(client as Client).address}</div>` : ""}
                ${(client as Client).fullAddress ? `<div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;display:inline-block;width:80px;">Full Addr</span>${(client as Client).fullAddress}</div>` : ""}
                ${(client as Client).geoStatus ? `<div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;display:inline-block;width:80px;">Geo Status</span>${(client as Client).geoStatus}</div>` : ""}
                ${client.fieldPerson ? `<div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;display:inline-block;width:80px;">Field</span>${client.fieldPerson}</div>` : ""}
                ${client.computerPerson ? `<div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;display:inline-block;width:80px;">Computer</span>${client.computerPerson}</div>` : ""}
              </div>
              ${dist}
            </div>
          `);
          infoWindowRef.current.open(googleMapRef.current, marker);
        }
      });
      return marker;
    });

    markersRef.current = newMarkers;

    // Custom amber cluster renderer
    const clusterRenderer = {
      render({ count, position }: { count: number; position: google.maps.LatLng }) {
        const size = count > 99 ? 52 : count > 9 ? 44 : 38;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2 - 3;

        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(251,191,36,0.2)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "#f59e0b";
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.font = `bold ${count > 99 ? 13 : 14}px Inter, Arial, sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(count), cx, cy);

        return new google.maps.Marker({
          position,
          icon: {
            url: canvas.toDataURL(),
            scaledSize: new google.maps.Size(size, size),
            anchor: new google.maps.Point(cx, cy),
          },
          zIndex: 1000,
        });
      },
    };

    clustererRef.current = new MarkerClusterer({
      map: googleMapRef.current,
      markers: newMarkers,
      renderer: clusterRenderer,
    });

    if (!hasUserLoc && !selected && !bounds.isEmpty()) {
      googleMapRef.current.fitBounds(bounds, { top: 60, right: 40, bottom: 60, left: 40 });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Map, InfoWindow } = await importLibrary("maps") as google.maps.MapsLibrary;
        if (cancelled || !mapRef.current) return;
        const map = new Map(mapRef.current, {
          center: DELHI,
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          gestureHandling: "greedy",
          styles: MAP_STYLES,
          backgroundColor: "#f8fafc",
        });
        googleMapRef.current = map;
        infoWindowRef.current = new InfoWindow();
        directionsServiceRef.current = new google.maps.DirectionsService();
        const renderer = new google.maps.DirectionsRenderer({
          suppressMarkers: false,
          polylineOptions: {
            strokeColor: "#3b82f6",
            strokeWeight: 5,
            strokeOpacity: 0.85,
          },
        });
        renderer.setMap(map);
        directionsRendererRef.current = renderer;
        setMapReady(true);
      } catch (err) {
        if (!cancelled) setMapError(String(err));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapReady || !googleMapRef.current) return;
    updateMarkers(mappableClients, selectedClient, !!userLocation);
  }, [mappableClients, selectedClient, userLocation, mapReady, updateMarkers]);

  useEffect(() => {
    if (!mapReady || !googleMapRef.current || typeof google === "undefined" || !google.maps) return;
    if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null; }
    if (userLocation) {
      userMarkerRef.current = new google.maps.Marker({
        position: userLocation,
        map: googleMapRef.current,
        title: "You",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#6366f1",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        zIndex: 999,
      });
      googleMapRef.current.panTo(userLocation);
      googleMapRef.current.setZoom(11);
    }
  }, [userLocation, mapReady]);

  useEffect(() => {
    if (selectedClient && googleMapRef.current) {
      googleMapRef.current.panTo({ lat: selectedClient.latitude, lng: selectedClient.longitude });
      const z = googleMapRef.current.getZoom() ?? 5;
      if (z < 12) googleMapRef.current.setZoom(12);
    }
    if (!selectedClient) clearDirections();
  }, [selectedClient]);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const clearDirections = () => {
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      if (googleMapRef.current) directionsRendererRef.current.setMap(googleMapRef.current);
    }
    setRouteInfo(null);
    setNavMode(null);
    setNavError(null);
  };

  const getDirections = async (mode: "DRIVING" | "TWO_WHEELER", client: Client) => {
    if (!directionsServiceRef.current || !directionsRendererRef.current || !googleMapRef.current) return;
    setNavLoading(true);
    setNavError(null);
    setNavMode(mode);
    setRouteInfo(null);
    try {
      let origin = userLocationRef.current;
      if (!origin) {
        origin = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
          if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return; }
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setUserLocation(loc);
              userLocationRef.current = loc;
              resolve(loc);
            },
            () => reject(new Error("Location access denied. Please allow location in browser settings."))
          );
        });
      }
      const result = await directionsServiceRef.current.route({
        origin,
        destination: { lat: client.latitude, lng: client.longitude },
        travelMode: mode as google.maps.TravelMode,
      });
      directionsRendererRef.current.setDirections(result);
      const leg = result.routes[0]?.legs[0];
      setRouteInfo({
        distance: leg?.distance?.text ?? "—",
        duration: leg?.duration?.text ?? "—",
        mode,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setNavError(msg.includes("ZERO_RESULTS") ? "No route found for this mode." : msg);
      setNavMode(null);
    }
    setNavLoading(false);
  };

  const openInGoogleMaps = (client: Client, mode: "DRIVING" | "TWO_WHEELER") => {
    const travelMode = mode === "TWO_WHEELER" ? "two-wheeler" : "driving";
    const dest = `${client.latitude},${client.longitude}`;
    const origin = userLocationRef.current
      ? `${userLocationRef.current.lat},${userLocationRef.current.lng}`
      : "";
    const url = origin
      ? `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=${travelMode}`
      : `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${travelMode}`;
    window.open(url, "_blank");
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) { setLocationError("Geolocation not supported."); return; }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLoading(false);
        setCommittedSearch("");
        setSearchQuery("");
        setLocalFilterClients(null);
      },
      () => {
        setLocationError("Location access denied. Please allow in browser settings.");
        setLocationLoading(false);
      }
    );
  };

  const handleSearch = () => {
    setLocalFilterClients(null);
    setLocalityFilter("");
    setCommittedSearch(searchQuery);
    setUserLocation(null);
    setSelectedClient(null);
    setShowSuggestions(false);
  };

  const handleClearLocation = () => {
    setUserLocation(null);
    setLocalFilterClients(null);
    setLocalityFilter("");
    setSelectedClient(null);
    if (googleMapRef.current) {
      googleMapRef.current.setCenter(DELHI);
      googleMapRef.current.setZoom(11);
    }
  };

  const SUGGESTION_ICON: Record<string, React.ReactNode> = {
    client: <Building2 className="h-3 w-3 text-amber-500 shrink-0" />,
    locality: <MapPin className="h-3 w-3 text-teal-500 shrink-0" />,
    city: <MapPin className="h-3 w-3 text-indigo-500 shrink-0" />,
    state: <MapPin className="h-3 w-3 text-blue-500 shrink-0" />,
    field: <User className="h-3 w-3 text-emerald-500 shrink-0" />,
    computer: <Monitor className="h-3 w-3 text-violet-500 shrink-0" />,
    pin: <Hash className="h-3 w-3 text-rose-500 shrink-0" />,
  };
  const SUGGESTION_BADGE: Record<string, string> = {
    client: "bg-amber-50 text-amber-600",
    locality: "bg-teal-50 text-teal-600",
    city: "bg-indigo-50 text-indigo-600",
    state: "bg-blue-50 text-blue-600",
    field: "bg-emerald-50 text-emerald-600",
    computer: "bg-violet-50 text-violet-600",
    pin: "bg-rose-50 text-rose-600",
  };
  const SUGGESTION_BADGE_LABEL: Record<string, string> = {
    client: "Client",
    locality: "Locality",
    city: "City",
    state: "State",
    field: "Field",
    computer: "Computer",
    pin: "PIN",
  };

  const isLoading = clientsLoading || nearbyLoading;

  const statsPanel = (
    <div className="px-3 py-3 shrink-0 border-b border-slate-100 space-y-3">
      {statsLoading ? (
        <div className="grid grid-cols-4 gap-1.5">
          {[0,1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl bg-slate-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-slate-50 rounded-xl p-2 border border-slate-100 text-center">
            <p className="text-[8px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Clients</p>
            <p className="text-lg font-bold text-slate-800 tabular-nums leading-none">{stats?.total ?? 0}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2 border border-slate-100 text-center">
            <p className="text-[8px] text-slate-400 uppercase tracking-wider font-semibold mb-1">Cities</p>
            <p className="text-lg font-bold text-slate-800 tabular-nums leading-none">{stats?.byCity?.length ?? 0}</p>
          </div>
          <div className="bg-indigo-50 rounded-xl p-2 border border-indigo-100 text-center">
            <p className="text-[8px] text-indigo-500 uppercase tracking-wider font-semibold mb-1">States</p>
            <p className="text-lg font-bold text-indigo-600 tabular-nums leading-none">{stats?.byState?.length ?? 0}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-2 border border-amber-100 text-center">
            <p className="text-[8px] text-amber-500 uppercase tracking-wider font-semibold mb-1">Shown</p>
            <p className="text-lg font-bold text-amber-600 tabular-nums leading-none">{listClients.length}</p>
          </div>
        </div>
      )}

      {/* States list */}
      {!statsLoading && stats?.byState && stats.byState.length > 0 && (
        <div>
          <p className="text-[8px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">States covered</p>
          <div className="flex flex-wrap gap-1">
            {stats.byState.map(({ state, count }: { state: string; count: number }) => (
              <button
                key={state}
                onClick={() => {
                  const filtered = (allClientsData as Client[])?.filter(c => c.state === state) ?? [];
                  setLocalFilterClients(filtered);
                  setSearchQuery(state);
                  setUserLocation(null);
                  setSelectedClient(null);
                  setShowStats(false);
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded-md text-[9px] font-medium text-indigo-700 hover:bg-indigo-100 transition-colors cursor-pointer"
              >
                {state}
                <span className="text-indigo-400 font-mono">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cities list */}
      {!statsLoading && stats?.byCity && stats.byCity.length > 0 && (
        <div>
          <p className="text-[8px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">Cities covered</p>
          <div className="flex flex-wrap gap-1">
            {stats.byCity.map(({ city, count }: { city: string; count: number }) => (
              <button
                key={city}
                onClick={() => {
                  setLocalFilterClients(null);
                  setLocalityFilter("");
                  setSearchQuery(city);
                  setCommittedSearch(city);
                  setUserLocation(null);
                  setSelectedClient(null);
                  setShowStats(false);
                }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-[9px] font-medium text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {city}
                <span className="text-slate-400 font-mono">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Localities list */}
      {!statsLoading && stats?.byLocality && stats.byLocality.length > 0 && (
        <div>
          <p className="text-[8px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">Localities</p>
          <div className="flex flex-wrap gap-1">
            {(stats.byLocality as { locality: string; count: number }[]).map(({ locality, count }) => (
              <button
                key={locality}
                onClick={() => {
                  if (locality === "Locality Not Updated") {
                    setLocalFilterClients(
                      ((allClientsData as Client[]) ?? []).filter((c) => !c.locality || c.locality.trim() === "")
                    );
                    setLocalityFilter("");
                  } else {
                    setLocalityFilter(locality);
                    setLocalFilterClients(null);
                  }
                  setSearchQuery(locality);
                  setUserLocation(null);
                  setSelectedClient(null);
                  setShowStats(false);
                }}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded-md text-[9px] font-medium transition-colors cursor-pointer ${
                  locality === "Locality Not Updated"
                    ? "bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-200"
                    : localityFilter === locality
                      ? "bg-teal-100 border-teal-300 text-teal-700"
                      : "bg-teal-50 border-teal-100 text-teal-700 hover:bg-teal-100"
                }`}
              >
                {locality}
                <span className="font-mono opacity-70">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const searchBox = (isMobile: boolean) => (
    <div ref={isMobile ? undefined : searchWrapRef} className="relative">
      <div className={`flex gap-2 ${isMobile ? "" : ""}`}>
        <div className="relative flex-1">
          <Search className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none ${isMobile ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => { if (searchQuery.length >= 2) setShowSuggestions(true); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
              if (e.key === "Escape") setShowSuggestions(false);
            }}
            placeholder={isMobile ? "Search clients, city, person…" : "Search by client, city, state, person…"}
            className={`w-full pl-8 pr-3 bg-slate-50 text-slate-800 placeholder:text-slate-400 border border-slate-200 rounded-xl focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 transition-all ${isMobile ? "py-2 text-[12px]" : "py-2.5 text-[13px]"}`}
          />
        </div>
        <button
          onClick={handleSearch}
          className={`px-3.5 bg-amber-400 hover:bg-amber-500 active:bg-amber-600 text-white rounded-xl font-bold transition-colors shrink-0 shadow-sm shadow-amber-200 ${isMobile ? "py-2 text-[12px]" : "py-2.5 text-[13px]"}`}
        >
          Go
        </button>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1.5 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onMouseDown={(e) => { e.preventDefault(); handleSuggestionClick(s); }}
              className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
            >
              {SUGGESTION_ICON[s.type]}
              <span className="flex-1 text-[12px] text-slate-700 truncate">{s.label}</span>
              <span className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-md shrink-0 ${SUGGESTION_BADGE[s.type]}`}>
                {SUGGESTION_BADGE_LABEL[s.type]}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const sidebar = (
    <div className="flex flex-col h-full bg-white text-slate-800 overflow-hidden border-r border-slate-100">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center shrink-0 shadow-sm shadow-amber-200">
            <MapPin className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold text-slate-900 leading-tight tracking-tight">LLI Client Map</h1>
            <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-widest">Location Intelligence</p>
          </div>
          <Link
            to="/team"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition-colors text-[10px] font-bold shadow-sm shadow-indigo-200"
            title="Team Performance"
          >
            <Users className="h-3 w-3" />
            Team
          </Link>
          <button
            onClick={() => setShowStats(s => !s)}
            className={`p-1.5 rounded-lg transition-colors ${showStats ? "bg-amber-100 text-amber-600" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"}`}
            title="Toggle stats"
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div ref={searchWrapRef} className="px-3 py-3 shrink-0 border-b border-slate-100 space-y-2">
        {searchBox(false)}
        {userLocation ? (
          <button
            onClick={handleClearLocation}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl text-[12px] font-medium hover:bg-indigo-100 transition-colors"
          >
            <X className="h-3 w-3" /> Clear Location Filter
          </button>
        ) : (
          <button
            onClick={handleGetLocation}
            disabled={locationLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-600 border border-slate-200 rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-50"
          >
            {locationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            {locationLoading ? "Getting location…" : "Use My Current Location"}
          </button>
        )}
        {locationError && <p className="text-[10px] text-red-500 px-1 leading-relaxed">{locationError}</p>}
        {localFilterClients && (
          <button
            onClick={() => { setLocalFilterClients(null); setLocalityFilter(""); setSearchQuery(""); setCommittedSearch("Delhi"); }}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl text-[11px] font-medium hover:bg-amber-100 transition-colors"
          >
            <X className="h-3 w-3" /> Clear filter — {localFilterClients.length} clients shown
          </button>
        )}
        {localityFilter && !localFilterClients && (
          <button
            onClick={() => { setLocalityFilter(""); setSearchQuery(""); setCommittedSearch("Delhi"); }}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-xl text-[11px] font-medium hover:bg-teal-100 transition-colors"
          >
            <X className="h-3 w-3" /> Locality: {localityFilter}
          </button>
        )}
        {/* Locality dropdown */}
        {stats?.byLocality && (stats.byLocality as { locality: string; count: number }[]).length > 0 && (
          <select
            value={localityFilter}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                setLocalityFilter("");
                setLocalFilterClients(null);
                setCommittedSearch("Delhi");
                setSearchQuery("");
              } else {
                setLocalityFilter(val);
                setLocalFilterClients(null);
                setSearchQuery(val);
                setUserLocation(null);
                setSelectedClient(null);
              }
            }}
            className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] text-slate-700 focus:outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all"
          >
            <option value="">📍 All Localities</option>
            {(stats.byLocality as { locality: string; count: number }[])
              .filter(({ locality }) => locality !== "Locality Not Updated")
              .map(({ locality, count }) => (
                <option key={locality} value={locality}>{locality} ({count})</option>
              ))}
          </select>
        )}
        {/* Geo Status filter */}
        <div className="flex gap-1 flex-wrap">
          {(["all", "done", "failed", "pending"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setGeoStatusFilter(f)}
              className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wide transition-colors ${
                geoStatusFilter === f
                  ? f === "done" ? "bg-green-100 text-green-700 border border-green-300"
                    : f === "failed" ? "bg-red-100 text-red-700 border border-red-300"
                    : f === "pending" ? "bg-amber-100 text-amber-700 border border-amber-300"
                    : "bg-slate-800 text-white"
                  : "bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-100"
              }`}
            >
              {f === "all" ? "All" : f === "done" ? "✅ Done" : f === "failed" ? "❌ Failed" : "⏳ Pending"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats (collapsible) */}
      {showStats && statsPanel}

      {/* List header */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between shrink-0">
        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
          {userLocation ? "Nearby Clients" : localFilterClients ? `Filtered — ${searchQuery}` : committedSearch ? `Results — ${committedSearch}` : "All Clients"}
        </span>
        {!isLoading && (
          <span className="text-[10px] text-slate-400 tabular-nums font-mono">{listClients.length}</span>
        )}
      </div>

      {/* Client list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 pb-6">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-xl mb-1.5 bg-slate-100" />
            ))
          ) : allDisplayClients.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3">
                <MapPin className="h-5 w-5 text-slate-300" />
              </div>
              <p className="text-[13px] text-slate-500 font-medium">No clients found</p>
              {committedSearch && <p className="text-[11px] text-slate-400 mt-1">Try a different search</p>}
            </div>
          ) : (
            listClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                selected={selectedClient?.id === client.id}
                distance={"distanceKm" in client ? (client as ClientWithDistance).distanceKm : undefined}
                onClick={() => { setSelectedClient(client); setMobileTab("map"); }}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const mapPanel = (
    <div className="relative flex-1 h-full min-w-0 bg-slate-100">
      {!mapReady && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-3">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            </div>
            <p className="text-[12px] text-slate-400">Loading map…</p>
          </div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20 p-6">
          <div className="text-center max-w-xs">
            <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-3">
              <MapPin className="h-5 w-5 text-red-400" />
            </div>
            <p className="text-[13px] font-semibold text-slate-700 mb-1">Map failed to load</p>
            <p className="text-[11px] text-slate-400">{mapError}</p>
          </div>
        </div>
      )}

      <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

      {/* Zoom controls */}
      {mapReady && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
          <button
            onClick={() => googleMapRef.current?.setZoom((googleMapRef.current.getZoom() ?? 10) + 1)}
            className="w-9 h-9 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 hover:border-slate-300 text-lg font-light flex items-center justify-center transition-all shadow-sm hover:shadow"
          >+</button>
          <button
            onClick={() => googleMapRef.current?.setZoom((googleMapRef.current.getZoom() ?? 10) - 1)}
            className="w-9 h-9 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 hover:border-slate-300 text-lg font-light flex items-center justify-center transition-all shadow-sm hover:shadow"
          >−</button>
        </div>
      )}

      {/* Selected client — desktop overlay */}
      {selectedClient && (
        <div className="hidden md:block absolute top-4 right-16 bg-white rounded-2xl shadow-xl w-[290px] z-10 overflow-hidden border border-slate-100">
          {/* Dark header */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-700 px-4 pt-4 pb-3 relative">
            <button
              onClick={() => setSelectedClient(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <p className="text-[13px] font-bold text-white leading-snug pr-6">{selectedClient.companyName}</p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="px-1.5 py-0.5 bg-white/15 text-white/80 rounded text-[9px] font-mono font-bold">{selectedClient.companyCode}</span>
              {selectedClient.pinCode && (
                <span className="px-1.5 py-0.5 bg-rose-400/25 text-rose-200 rounded text-[9px] font-mono font-bold"># {selectedClient.pinCode}</span>
              )}
            </div>
          </div>

          {/* Info cards */}
          <div className="p-3 space-y-2">
            {selectedClient.locality && (
              <div className="bg-teal-50 rounded-xl p-2.5 border border-teal-100">
                <p className="text-[8px] text-teal-500 uppercase tracking-wider mb-0.5 flex items-center gap-1"><MapPin className="h-2 w-2" />Locality</p>
                <p className="text-[11px] text-teal-700 font-semibold">{selectedClient.locality}</p>
              </div>
            )}
            <div className="flex gap-2">
              <div className="flex-1 bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <p className="text-[8px] text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1"><MapPin className="h-2 w-2" />Area / City</p>
                <p className="text-[11px] text-slate-700 font-medium">{selectedClient.city}</p>
                <p className="text-[10px] text-slate-400">{selectedClient.state}{selectedClient.pinCode ? ` — ${selectedClient.pinCode}` : ""}</p>
              </div>
              <div className="flex gap-2">
                {selectedClient.fieldPerson && (
                  <div className="bg-emerald-50 rounded-xl p-2.5 border border-emerald-100">
                    <p className="text-[8px] text-emerald-500 uppercase tracking-wider mb-0.5 flex items-center gap-1"><User className="h-2 w-2" />Field</p>
                    <p className="text-[11px] text-emerald-700 font-semibold whitespace-nowrap">{selectedClient.fieldPerson}</p>
                  </div>
                )}
              </div>
            </div>
            {selectedClient.address && (
              <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                <p className="text-[8px] text-slate-400 uppercase tracking-wider mb-0.5 flex items-center gap-1"><Building2 className="h-2 w-2" />Company Address</p>
                <p className="text-[11px] text-slate-700">{selectedClient.address}</p>
              </div>
            )}
            {selectedClient.fullAddress && (
              <div className="bg-blue-50 rounded-xl p-2.5 border border-blue-100">
                <p className="text-[8px] text-blue-400 uppercase tracking-wider mb-0.5 flex items-center gap-1"><FileText className="h-2 w-2" />Full Address</p>
                <p className="text-[11px] text-blue-700">{selectedClient.fullAddress}</p>
              </div>
            )}
            {selectedClient.computerPerson && (
              <div className="bg-violet-50 rounded-xl p-2.5 border border-violet-100">
                <p className="text-[8px] text-violet-500 uppercase tracking-wider mb-0.5 flex items-center gap-1"><Monitor className="h-2 w-2" />Computer Person</p>
                <p className="text-[11px] text-violet-700 font-semibold">{selectedClient.computerPerson}</p>
              </div>
            )}
            {selectedClient.geoStatus && (
              <div className={`rounded-xl p-2.5 border ${selectedClient.geoStatus.toLowerCase().includes("done") ? "bg-green-50 border-green-100" : selectedClient.geoStatus.toLowerCase().includes("failed") ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                <p className={`text-[8px] uppercase tracking-wider mb-0.5 ${selectedClient.geoStatus.toLowerCase().includes("done") ? "text-green-500" : selectedClient.geoStatus.toLowerCase().includes("failed") ? "text-red-500" : "text-amber-500"}`}>Geo Status</p>
                <p className={`text-[11px] font-semibold ${selectedClient.geoStatus.toLowerCase().includes("done") ? "text-green-700" : selectedClient.geoStatus.toLowerCase().includes("failed") ? "text-red-700" : "text-amber-700"}`}>{selectedClient.geoStatus}</p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="px-3 pb-3 border-t border-slate-100 pt-3">
            <div className="flex gap-1.5 mb-2">
              <button
                onClick={() => getDirections("DRIVING", selectedClient)}
                disabled={navLoading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold border transition-all ${
                  navMode === "DRIVING"
                    ? "bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-200"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600"
                } disabled:opacity-50`}
              >
                {navLoading && navMode === "DRIVING" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Car className="h-3 w-3" />}
                Car
              </button>
              <button
                onClick={() => getDirections("TWO_WHEELER", selectedClient)}
                disabled={navLoading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold border transition-all ${
                  navMode === "TWO_WHEELER"
                    ? "bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-200"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600"
                } disabled:opacity-50`}
              >
                {navLoading && navMode === "TWO_WHEELER" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bike className="h-3 w-3" />}
                Bike
              </button>
              {routeInfo && (
                <button onClick={clearDirections} className="w-8 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 hover:bg-red-50 hover:border-red-200 hover:text-red-400 transition-all">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {navError && <p className="text-[10px] text-red-500 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mb-2">{navError}</p>}
            {routeInfo && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[12px] font-bold text-blue-700"><Route className="h-3 w-3" />{routeInfo.distance}</span>
                  <span className="flex items-center gap-1 text-[11px] text-blue-500"><Clock className="h-2.5 w-2.5" />{routeInfo.duration}</span>
                </div>
                <span className="text-[9px] text-blue-400 font-bold">{routeInfo.mode === "DRIVING" ? "🚗" : "🏍️"}</span>
              </div>
            )}
            <button
              onClick={() => openInGoogleMaps(selectedClient, (navMode ?? "DRIVING") as "DRIVING" | "TWO_WHEELER")}
              className="w-full flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl text-[11px] font-bold transition-colors shadow-sm shadow-green-200"
            >
              <ExternalLink className="h-3 w-3" /> Open in Google Maps
            </button>
          </div>
        </div>
      )}

      {/* Selected client — mobile bottom sheet */}
      {selectedClient && (
        <div className="md:hidden absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl z-20 shadow-2xl overflow-hidden">
          {/* Handle bar */}
          <div className="pt-2.5 pb-1 flex justify-center">
            <div className="w-10 h-1 bg-slate-200 rounded-full" />
          </div>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-1">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-slate-900 leading-tight">{selectedClient.companyName}</p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-mono font-bold">{selectedClient.companyCode}</span>
                {selectedClient.pinCode && (
                  <span className="px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[9px] font-mono font-bold border border-rose-100"># {selectedClient.pinCode}</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelectedClient(null)}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 active:bg-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable info pills */}
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {selectedClient.locality && (
              <div className="flex-none flex items-center gap-1.5 px-3 py-2 bg-teal-50 border border-teal-100 rounded-2xl">
                <MapPin className="h-3 w-3 text-teal-500 shrink-0" />
                <span className="text-[11px] text-teal-700 font-semibold whitespace-nowrap">{selectedClient.locality}</span>
              </div>
            )}
            <div className="flex-none flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-100 rounded-2xl">
              <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="text-[11px] text-slate-600 font-medium whitespace-nowrap">{selectedClient.city}{selectedClient.state ? `, ${selectedClient.state}` : ""}</span>
            </div>
            {selectedClient.pinCode && (
              <div className="flex-none flex items-center gap-1.5 px-3 py-2 bg-rose-50 border border-rose-100 rounded-2xl">
                <Hash className="h-3 w-3 text-rose-400 shrink-0" />
                <span className="text-[11px] text-rose-700 font-mono font-semibold whitespace-nowrap">{selectedClient.pinCode}</span>
              </div>
            )}
            {selectedClient.fullAddress && (
              <div className="flex-none flex items-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-100 rounded-2xl max-w-[220px]">
                <FileText className="h-3 w-3 text-blue-400 shrink-0" />
                <span className="text-[11px] text-blue-700 font-medium whitespace-nowrap truncate">{selectedClient.fullAddress}</span>
              </div>
            )}
            {selectedClient.fieldPerson && (
              <div className="flex-none flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <User className="h-3 w-3 text-emerald-500 shrink-0" />
                <span className="text-[11px] text-emerald-700 font-semibold whitespace-nowrap">{selectedClient.fieldPerson}</span>
              </div>
            )}
            {selectedClient.computerPerson && (
              <div className="flex-none flex items-center gap-1.5 px-3 py-2 bg-violet-50 border border-violet-100 rounded-2xl">
                <Monitor className="h-3 w-3 text-violet-500 shrink-0" />
                <span className="text-[11px] text-violet-700 font-semibold whitespace-nowrap">{selectedClient.computerPerson}</span>
              </div>
            )}
            {selectedClient.geoStatus && !selectedClient.geoStatus.toLowerCase().includes("done") && (
              <div className={`flex-none flex items-center gap-1.5 px-3 py-2 border rounded-2xl ${selectedClient.geoStatus.toLowerCase().includes("failed") ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                <span className="text-[11px] font-semibold whitespace-nowrap">{selectedClient.geoStatus}</span>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="px-4 pb-6 pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex gap-2">
              <button
                onClick={() => getDirections("DRIVING", selectedClient)}
                disabled={navLoading}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold border transition-all ${
                  navMode === "DRIVING" ? "bg-blue-500 border-blue-500 text-white" : "bg-slate-50 border-slate-200 text-slate-700 active:bg-blue-50"
                } disabled:opacity-50`}
              >
                {navLoading && navMode === "DRIVING" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Car className="h-4 w-4" />}
                Car
              </button>
              <button
                onClick={() => getDirections("TWO_WHEELER", selectedClient)}
                disabled={navLoading}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[13px] font-bold border transition-all ${
                  navMode === "TWO_WHEELER" ? "bg-blue-500 border-blue-500 text-white" : "bg-slate-50 border-slate-200 text-slate-700 active:bg-blue-50"
                } disabled:opacity-50`}
              >
                {navLoading && navMode === "TWO_WHEELER" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bike className="h-4 w-4" />}
                Bike
              </button>
              {routeInfo && (
                <button onClick={clearDirections} className="w-12 flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 active:bg-red-50 active:text-red-400">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {navError && <p className="text-[11px] text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{navError}</p>}
            {routeInfo && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold text-blue-700"><Route className="h-3.5 w-3.5" />{routeInfo.distance}</span>
                  <span className="flex items-center gap-1 text-[12px] text-blue-500 font-medium"><Clock className="h-3 w-3" />{routeInfo.duration}</span>
                </div>
                <span className="text-base">{routeInfo.mode === "DRIVING" ? "🚗" : "🏍️"}</span>
              </div>
            )}
            <button
              onClick={() => openInGoogleMaps(selectedClient, (navMode ?? "DRIVING") as "DRIVING" | "TWO_WHEELER")}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-500 active:bg-green-600 text-white rounded-2xl text-[14px] font-bold transition-colors"
            >
              <ExternalLink className="h-4 w-4" /> Open in Google Maps
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:flex h-screen w-full overflow-hidden bg-slate-50">
        <div className="w-72 xl:w-80 h-full flex flex-col shrink-0">
          {sidebar}
        </div>
        {mapPanel}
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden flex-col h-screen w-full overflow-hidden bg-white">
        {/* Mobile top bar */}
        <div className="px-3 pt-3 pb-2 bg-white border-b border-slate-100 shrink-0 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
              <MapPin className="h-3.5 w-3.5 text-white" />
            </div>
            <div ref={searchWrapRef} className="relative flex-1 flex gap-1.5">
              {searchBox(true)}
              <button
                onClick={handleGetLocation}
                disabled={locationLoading}
                className="w-9 h-9 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center text-slate-500 transition-colors disabled:opacity-50 shrink-0 hover:bg-slate-100"
              >
                {locationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {locationError && <p className="text-[10px] text-red-500 mt-1 px-1">{locationError}</p>}
        </div>

        {/* Content area */}
        <div className="flex-1 relative overflow-hidden">
          <div className={`absolute inset-0 ${mobileTab === "map" ? "z-10" : "z-0"}`}>
            {mapPanel}
          </div>
          <div className={`absolute inset-0 overflow-y-auto bg-white ${mobileTab === "list" ? "z-10" : "z-0"}`}>
            {/* Stats */}
            {statsPanel}
            {/* Client list */}
            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">
                  {userLocation ? "Nearby Clients" : localFilterClients ? `Filtered — ${searchQuery}` : committedSearch ? `Results — ${committedSearch}` : "All Clients"}
                </span>
                {!isLoading && <span className="text-[10px] text-slate-400 font-mono">{listClients.length}</span>}
              </div>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[76px] w-full rounded-xl mb-1.5 bg-slate-100" />
                ))
              ) : listClients.length === 0 ? (
                <div className="text-center py-10">
                  <MapPin className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-[13px] text-slate-500">No clients found</p>
                </div>
              ) : (
                listClients.map((client) => (
                  <ClientCard
                    key={client.id}
                    client={client}
                    selected={selectedClient?.id === client.id}
                    distance={"distanceKm" in client ? (client as ClientWithDistance).distanceKm : undefined}
                    onClick={() => { setSelectedClient(client); setMobileTab("map"); }}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Mobile bottom nav */}
        <div className="bg-white border-t border-slate-100 px-2 py-2 flex shrink-0 safe-area-bottom">
          <button
            onClick={() => setMobileTab("map")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors ${mobileTab === "map" ? "text-amber-500" : "text-slate-400"}`}
          >
            <MapPin className="h-4 w-4" />
            <span className="text-[9px] font-semibold uppercase tracking-wide">Map</span>
          </button>
          <button
            onClick={() => setMobileTab("list")}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors ${mobileTab === "list" ? "text-amber-500" : "text-slate-400"}`}
          >
            <Search className="h-4 w-4" />
            <span className="text-[9px] font-semibold uppercase tracking-wide">Clients</span>
          </button>
          <button
            onClick={handleGetLocation}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors ${userLocation ? "text-indigo-500" : "text-slate-400"}`}
          >
            <Navigation className="h-4 w-4" />
            <span className="text-[9px] font-semibold uppercase tracking-wide">Nearby</span>
          </button>
          <Link
            to="/team"
            className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-xl transition-colors text-slate-400 hover:text-indigo-500 active:text-indigo-600"
          >
            <Users className="h-4 w-4" />
            <span className="text-[9px] font-semibold uppercase tracking-wide">Team</span>
          </Link>
        </div>
      </div>
    </>
  );
}
