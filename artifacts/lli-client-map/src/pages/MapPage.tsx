import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { useListClients, useGetNearbyClients, useGetClientStats } from "@workspace/api-client-react";
import {
  Search, MapPin, Navigation,
  X, Loader2, BarChart2, List, Map as MapIcon,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

type Client = {
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
  createdAt?: string;
};
type ClientWithDistance = Client & { distanceKm: number };

const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-400",
  inactive: "bg-slate-500",
  prospect: "bg-amber-400",
  office: "bg-blue-400",
};
const STATUS_PILL: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/25",
  inactive: "bg-slate-600/30 text-slate-400 ring-slate-500/25",
  prospect: "bg-amber-500/15 text-amber-400 ring-amber-500/25",
  office: "bg-blue-500/15 text-blue-400 ring-blue-500/25",
};

function StatusPill({ status }: { status: string }) {
  const cls = STATUS_PILL[status.toLowerCase()] ?? "bg-slate-600/30 text-slate-400 ring-slate-500/25";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ring-1 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status.toLowerCase()] ?? "bg-slate-400"}`} />
      {status}
    </span>
  );
}

function ClientCard({ client, onClick, selected, distance }: {
  client: Client; onClick: () => void; selected: boolean; distance?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-3 rounded-xl border transition-all duration-150 mb-1.5 group ${
        selected
          ? "border-amber-400/50 bg-amber-400/8 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]"
          : "border-white/5 hover:border-white/10 hover:bg-white/4"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-slate-100 truncate leading-snug">{client.companyName}</p>
          <p className="text-[10px] text-slate-600 mt-0.5 font-mono tracking-wide">{client.companyCode}</p>
          <div className="flex items-center gap-1 mt-1.5">
            <MapPin className="h-2.5 w-2.5 text-slate-600 shrink-0" />
            <span className="text-[11px] text-slate-400 truncate">{client.city}, {client.state}</span>
          </div>
          {client.fieldPerson && (
            <p className="text-[10px] text-slate-600 mt-0.5 truncate">{client.fieldPerson}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
          <StatusPill status={client.status} />
          {distance !== undefined && (
            <span className="text-[11px] font-bold text-amber-400 tabular-nums">{distance.toFixed(1)} km</span>
          )}
        </div>
      </div>
    </button>
  );
}

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
  v: "weekly",
});

const DELHI = { lat: 28.6139, lng: 77.2090 };

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "all", elementType: "labels.text.stroke", stylers: [{ color: "#0f172a" }, { weight: 3 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0c1a2e" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#1a2540" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1e2d45" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#243150" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#1a2540" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1e3a5f" }, { weight: 1 }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#2563eb" }, { weight: 1.5 }] },
  { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#1e3a5f" }, { weight: 0.8 }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

function makeMarkerIcon(isSelected: boolean, isNearby: boolean, status: string): google.maps.Icon {
  const size = isSelected ? 44 : 34;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const colors: Record<string, string> = {
    active: "#10b981",
    inactive: "#64748b",
    prospect: "#f59e0b",
    office: "#3b82f6",
  };
  const fillColor = isSelected ? "#f59e0b" : (colors[status.toLowerCase()] ?? "#6366f1");
  const r = size / 2 - 3;
  const cx = size / 2;
  const cy = size / 2;

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(251,191,36,0.2)";
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.shadowColor = fillColor;
  ctx.shadowBlur = isSelected ? 12 : 6;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255,255,255,0.6)";
  ctx.lineWidth = isSelected ? 2.5 : 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx - r * 0.25, cy - r * 0.25, r * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fill();

  return {
    url: canvas.toDataURL(),
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

const STATUS_FILTERS = ["all", "active", "inactive", "prospect", "office"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export default function MapPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [committedSearch, setCommittedSearch] = useState("Delhi");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"map" | "list">("map");
  const [showStats, setShowStats] = useState(false);
  const [listExpanded, setListExpanded] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const clustererRef = useRef<import("@googlemaps/markerclusterer").MarkerClusterer | null>(null);

  const apiFilterParams = useMemo(() => {
    if (userLocation) return {};
    if (!committedSearch) return {};
    return /^\d{6}$/.test(committedSearch.trim())
      ? { pinCode: committedSearch.trim() }
      : { city: committedSearch.trim() };
  }, [committedSearch, userLocation]);

  const { data: rawClients, isLoading: clientsLoading } = useListClients(apiFilterParams);
  const { data: stats, isLoading: statsLoading } = useGetClientStats();
  const { data: nearbyClients, isLoading: nearbyLoading } = useGetNearbyClients(
    { lat: userLocation?.lat ?? 0, lng: userLocation?.lng ?? 0, radius: 50 },
    { query: { enabled: !!userLocation, queryKey: ["nearby", userLocation] } }
  );

  const allDisplayClients: (Client | ClientWithDistance)[] = useMemo(() => {
    const base = userLocation
      ? (Array.isArray(nearbyClients) ? nearbyClients : [])
      : (Array.isArray(rawClients) ? rawClients : []);
    if (statusFilter === "all") return base;
    return base.filter((c) => c.status.toLowerCase() === statusFilter);
  }, [userLocation, nearbyClients, rawClients, statusFilter]);

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

    const { MarkerClusterer, DefaultRenderer } = await import("@googlemaps/markerclusterer");

    const cityGroups = new Map<string, { lat: number; lng: number; count: number }>();
    list.forEach((c) => {
      const key = `${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`;
      if (!cityGroups.has(key)) cityGroups.set(key, { lat: c.latitude, lng: c.longitude, count: 0 });
      cityGroups.get(key)!.count++;
    });

    cityGroups.forEach(({ lat, lng, count }) => {
      const circle = new google.maps.Circle({
        center: { lat, lng },
        radius: 800 + count * 400,
        fillColor: "#3b82f6",
        fillOpacity: 0.06,
        strokeColor: "#3b82f6",
        strokeOpacity: 0.18,
        strokeWeight: 1,
        map: googleMapRef.current!,
        zIndex: 0,
      });
      circlesRef.current.push(circle);
    });

    const bounds = new google.maps.LatLngBounds();
    const newMarkers = list.map((client) => {
      const isNearby = hasUserLoc && "distanceKm" in client;
      const isSelected = selected?.id === client.id;
      const icon = makeMarkerIcon(isSelected, isNearby, client.status);
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
            ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;color:#d97706;font-weight:700;font-size:11px;">📍 ${(client as ClientWithDistance).distanceKm.toFixed(1)} km away</div>` : "";
          infoWindowRef.current.setContent(`
            <div style="font-family:Inter,system-ui,sans-serif;padding:4px 2px;min-width:200px;">
              <div style="font-weight:700;font-size:13px;color:#0f172a;margin-bottom:2px;">${client.companyName}</div>
              <div style="font-size:10px;color:#94a3b8;font-family:monospace;margin-bottom:8px;">${client.companyCode}</div>
              <div style="font-size:11px;color:#475569;margin-bottom:3px;"><span style="color:#94a3b8;font-weight:600;">City</span> ${client.city}, ${client.state}</div>
              <div style="font-size:11px;color:#475569;margin-bottom:3px;"><span style="color:#94a3b8;font-weight:600;">PIN</span> ${client.pinCode}</div>
              <div style="font-size:11px;color:#475569;"><span style="color:#94a3b8;font-weight:600;">Field</span> ${client.fieldPerson}</div>
              ${dist}
            </div>
          `);
          infoWindowRef.current.open(googleMapRef.current, marker);
        }
      });
      return marker;
    });

    markersRef.current = newMarkers;
    clustererRef.current = new MarkerClusterer({
      map: googleMapRef.current,
      markers: newMarkers,
      renderer: new DefaultRenderer(),
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
          backgroundColor: "#0a1628",
        });
        googleMapRef.current = map;
        infoWindowRef.current = new InfoWindow();
        setMapReady(true);
      } catch (err) {
        if (!cancelled) setMapError(String(err));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!mapReady || !googleMapRef.current) return;
    updateMarkers(allDisplayClients, selectedClient, !!userLocation);
  }, [allDisplayClients, selectedClient, userLocation, mapReady, updateMarkers]);

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
  }, [selectedClient]);

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
      },
      () => {
        setLocationError("Location access denied. Please allow in browser settings.");
        setLocationLoading(false);
      }
    );
  };

  const handleSearch = () => {
    setCommittedSearch(searchQuery);
    setUserLocation(null);
    setSelectedClient(null);
  };

  const handleClearLocation = () => {
    setUserLocation(null);
    setSelectedClient(null);
    if (googleMapRef.current) {
      googleMapRef.current.setCenter(DELHI);
      googleMapRef.current.setZoom(11);
    }
  };

  const isLoading = clientsLoading || nearbyLoading;

  const statsPanel = (
    <div className="px-3 py-3 shrink-0 border-b border-white/6">
      {statsLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[0,1,2].map(i => <Skeleton key={i} className="h-14 rounded-xl bg-white/5" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white/4 rounded-xl p-2.5 border border-white/6">
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-1.5">Total</p>
            <p className="text-xl font-bold text-white tabular-nums">{stats?.total ?? 0}</p>
            <p className="text-[9px] text-slate-600 mt-0.5">clients</p>
          </div>
          <div className="bg-white/4 rounded-xl p-2.5 border border-white/6">
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-1.5">Cities</p>
            <p className="text-xl font-bold text-white tabular-nums">{stats?.byCity?.length ?? 0}</p>
            <p className="text-[9px] text-slate-600 mt-0.5">covered</p>
          </div>
          <div className="bg-white/4 rounded-xl p-2.5 border border-white/6">
            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-1.5">Shown</p>
            <p className="text-xl font-bold text-amber-400 tabular-nums">{allDisplayClients.length}</p>
            <p className="text-[9px] text-slate-600 mt-0.5">filtered</p>
          </div>
        </div>
      )}
      {!statsLoading && stats?.byStatus && stats.byStatus.length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {stats.byStatus.map(({ status, count }: { status: string; count: number }) => (
            <div key={status} className="flex items-center gap-1 text-[10px] text-slate-500">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status.toLowerCase()] ?? "bg-slate-500"}`} />
              <span className="capitalize">{status}</span>
              <span className="text-slate-700 font-mono">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const sidebar = (
    <div className="flex flex-col h-full bg-[#080f1e] text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-white/6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center shrink-0 shadow-lg shadow-amber-400/20">
            <MapPin className="h-4 w-4 text-slate-900" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold text-white leading-tight tracking-tight">LLI Client Map</h1>
            <p className="text-[9px] text-slate-600 mt-0.5 uppercase tracking-widest">Location Intelligence</p>
          </div>
          <button
            onClick={() => setShowStats(s => !s)}
            className={`p-1.5 rounded-lg transition-colors ${showStats ? "bg-amber-400/15 text-amber-400" : "text-slate-600 hover:text-slate-400 hover:bg-white/5"}`}
            title="Toggle stats"
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3 shrink-0 border-b border-white/6 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-600 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="City, area, or PIN code…"
              className="w-full pl-8 pr-3 py-2.5 text-[13px] bg-white/5 text-white placeholder:text-slate-600 border border-white/8 rounded-xl focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/15 transition-all"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-3.5 py-2.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-900 rounded-xl text-[13px] font-bold transition-colors shrink-0 shadow-lg shadow-amber-400/20"
          >
            Go
          </button>
        </div>
        {userLocation ? (
          <button
            onClick={handleClearLocation}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl text-[12px] font-medium hover:bg-indigo-500/15 transition-colors"
          >
            <X className="h-3 w-3" /> Clear Location Filter
          </button>
        ) : (
          <button
            onClick={handleGetLocation}
            disabled={locationLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/5 hover:bg-white/8 active:bg-white/10 text-slate-300 border border-white/8 rounded-xl text-[12px] font-semibold transition-colors disabled:opacity-50"
          >
            {locationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            {locationLoading ? "Getting location…" : "Use My Current Location"}
          </button>
        )}
        {locationError && <p className="text-[10px] text-red-400 px-1 leading-relaxed">{locationError}</p>}
      </div>

      {/* Stats (collapsible) */}
      {showStats && statsPanel}

      {/* Status filter */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-all ${
                statusFilter === s
                  ? "bg-amber-400 text-slate-900 shadow-sm"
                  : "bg-white/5 text-slate-500 hover:bg-white/8 hover:text-slate-300 border border-white/6"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {/* List header */}
      <div className="px-3 pb-2 flex items-center justify-between shrink-0">
        <span className="text-[9px] text-slate-600 uppercase tracking-widest font-bold">
          {userLocation ? "Nearby Clients" : committedSearch ? `Results — ${committedSearch}` : "All Clients"}
        </span>
        {!isLoading && (
          <span className="text-[10px] text-slate-700 tabular-nums font-mono">{allDisplayClients.length}</span>
        )}
      </div>

      {/* Client list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 pb-6">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-xl mb-1.5 bg-white/4" />
            ))
          ) : allDisplayClients.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-white/4 border border-white/6 flex items-center justify-center mx-auto mb-3">
                <MapPin className="h-5 w-5 text-slate-700" />
              </div>
              <p className="text-[13px] text-slate-500 font-medium">No clients found</p>
              {committedSearch && <p className="text-[11px] text-slate-700 mt-1">Try a different search</p>}
            </div>
          ) : (
            allDisplayClients.map((client) => (
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
    <div className="relative flex-1 h-full min-w-0 bg-[#0a1628]">
      {!mapReady && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a1628] z-20">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto mb-3">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
            </div>
            <p className="text-[12px] text-slate-500">Loading map…</p>
          </div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a1628] z-20 p-6">
          <div className="text-center max-w-xs">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-3">
              <MapPin className="h-5 w-5 text-red-400" />
            </div>
            <p className="text-[13px] font-semibold text-slate-300 mb-1">Map failed to load</p>
            <p className="text-[11px] text-slate-600">{mapError}</p>
          </div>
        </div>
      )}

      <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

      {/* Zoom controls */}
      {mapReady && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
          <button
            onClick={() => googleMapRef.current?.setZoom((googleMapRef.current.getZoom() ?? 10) + 1)}
            className="w-9 h-9 bg-[#0d1929]/90 backdrop-blur-sm border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-white/20 text-lg font-light flex items-center justify-center transition-all shadow-lg"
          >+</button>
          <button
            onClick={() => googleMapRef.current?.setZoom((googleMapRef.current.getZoom() ?? 10) - 1)}
            className="w-9 h-9 bg-[#0d1929]/90 backdrop-blur-sm border border-white/10 rounded-xl text-slate-300 hover:text-white hover:border-white/20 text-lg font-light flex items-center justify-center transition-all shadow-lg"
          >−</button>
        </div>
      )}

      {/* Legend */}
      {mapReady && (
        <div className="absolute bottom-5 left-4 bg-[#0d1929]/90 backdrop-blur-sm border border-white/8 rounded-xl px-3 py-2.5 z-10 pointer-events-none shadow-xl">
          <div className="flex items-center gap-3 flex-wrap">
            {Object.entries(STATUS_DOT).map(([s, dot]) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                <span className="text-[10px] text-slate-500 capitalize">{s}</span>
              </div>
            ))}
            {userLocation && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span className="text-[10px] text-slate-500">You</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selected client — desktop overlay */}
      {selectedClient && (
        <div className="hidden md:block absolute top-4 right-16 bg-[#0d1929]/95 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl max-w-[260px] z-10">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-white leading-snug">{selectedClient.companyName}</p>
              <p className="text-[10px] text-slate-600 font-mono mt-0.5">{selectedClient.companyCode}</p>
            </div>
            <button
              onClick={() => setSelectedClient(null)}
              className="text-slate-600 hover:text-slate-300 transition-colors shrink-0 p-0.5 rounded-lg hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 mb-3">
            <p className="text-[11px] text-slate-400"><span className="text-slate-600">City</span> {selectedClient.city}, {selectedClient.state}</p>
            <p className="text-[11px] text-slate-400"><span className="text-slate-600">PIN</span> {selectedClient.pinCode}</p>
            {selectedClient.fieldPerson && <p className="text-[11px] text-slate-400"><span className="text-slate-600">Field</span> {selectedClient.fieldPerson}</p>}
          </div>
          <StatusPill status={selectedClient.status} />
        </div>
      )}

      {/* Selected client — mobile bottom sheet */}
      {selectedClient && (
        <div className="md:hidden absolute bottom-0 left-0 right-0 bg-[#0d1929]/97 backdrop-blur-lg border-t border-white/10 rounded-t-2xl p-4 z-20 shadow-2xl">
          <div className="w-8 h-0.5 bg-white/20 rounded-full mx-auto mb-3" />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-white leading-snug">{selectedClient.companyName}</p>
              <p className="text-[10px] text-slate-600 font-mono mt-0.5">{selectedClient.companyCode}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusPill status={selectedClient.status} />
              <button
                onClick={() => setSelectedClient(null)}
                className="text-slate-600 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="bg-white/4 rounded-xl p-2.5 border border-white/6">
              <p className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">City</p>
              <p className="text-[11px] text-slate-300 font-medium">{selectedClient.city}</p>
            </div>
            <div className="bg-white/4 rounded-xl p-2.5 border border-white/6">
              <p className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">PIN</p>
              <p className="text-[11px] text-slate-300 font-medium font-mono">{selectedClient.pinCode}</p>
            </div>
            <div className="bg-white/4 rounded-xl p-2.5 border border-white/6">
              <p className="text-[9px] text-slate-600 uppercase tracking-wide mb-1">Field</p>
              <p className="text-[11px] text-slate-300 font-medium truncate">{selectedClient.fieldPerson || "—"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:flex h-screen w-full overflow-hidden">
        <div className="w-72 xl:w-80 h-full flex flex-col shrink-0 border-r border-white/6">
          {sidebar}
        </div>
        {mapPanel}
      </div>

      {/* Mobile layout */}
      <div className="flex md:hidden flex-col h-screen w-full overflow-hidden bg-[#080f1e]">
        {/* Mobile top bar */}
        <div className="px-3 pt-safe-top pt-3 pb-2 bg-[#080f1e] border-b border-white/6 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-400 flex items-center justify-center shrink-0">
              <MapPin className="h-3.5 w-3.5 text-slate-900" />
            </div>
            <div className="flex gap-1.5 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-600 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="City or PIN…"
                  className="w-full pl-7 pr-3 py-2 text-[12px] bg-white/6 text-white placeholder:text-slate-600 border border-white/8 rounded-xl focus:outline-none focus:border-amber-400/50 transition-all"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-3 py-2 bg-amber-400 text-slate-900 rounded-xl text-[12px] font-bold transition-colors shrink-0"
              >Go</button>
              <button
                onClick={handleGetLocation}
                disabled={locationLoading}
                className="w-9 h-9 bg-white/6 border border-white/8 rounded-xl flex items-center justify-center text-slate-400 transition-colors disabled:opacity-50 shrink-0"
              >
                {locationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {locationError && <p className="text-[10px] text-red-400 mt-1 px-1">{locationError}</p>}
        </div>

        {/* Content area */}
        <div className="flex-1 relative overflow-hidden">
          {/* Map (always rendered) */}
          <div className={`absolute inset-0 ${mobileTab === "map" ? "z-10" : "z-0"}`}>
            {mapPanel}
          </div>

          {/* List (slides over map) */}
          {mobileTab === "list" && (
            <div className="absolute inset-0 z-20 bg-[#080f1e] overflow-hidden">
              {sidebar}
            </div>
          )}
        </div>

        {/* Mobile bottom tab bar */}
        <div className="bg-[#080f1e] border-t border-white/6 shrink-0 pb-safe-bottom">
          <div className="flex">
            <button
              onClick={() => setMobileTab("map")}
              className={`flex-1 py-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-colors ${
                mobileTab === "map" ? "text-amber-400" : "text-slate-600"
              }`}
            >
              <MapIcon className="h-4 w-4" />
              Map
            </button>
            <button
              onClick={() => setMobileTab("list")}
              className={`flex-1 py-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold transition-colors ${
                mobileTab === "list" ? "text-amber-400" : "text-slate-600"
              }`}
            >
              <List className="h-4 w-4" />
              Clients
              {!isLoading && allDisplayClients.length > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${mobileTab === "list" ? "bg-amber-400 text-slate-900" : "bg-white/8 text-slate-500"}`}>
                  {allDisplayClients.length}
                </span>
              )}
            </button>
            <button
              onClick={() => { setMobileTab("map"); handleGetLocation(); }}
              className="flex-1 py-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-600 transition-colors"
            >
              <Navigation className="h-4 w-4" />
              Nearby
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
