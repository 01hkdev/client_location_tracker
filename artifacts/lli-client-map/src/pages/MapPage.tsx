import { useState, useEffect, useRef, useCallback } from "react";
import { useListClients, useGetNearbyClients, useGetClientStats } from "@workspace/api-client-react";
import { Search, MapPin, Navigation, Users, Building2, TrendingUp, X, Loader2 } from "lucide-react";
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

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  inactive: "bg-gray-100 text-gray-600 border-gray-200",
  prospect: "bg-amber-100 text-amber-800 border-amber-200",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? "bg-blue-100 text-blue-800 border-blue-200";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${cls}`}>
      {status}
    </span>
  );
}

function ClientCard({ client, onClick, selected, distance }: {
  client: Client;
  onClick: () => void;
  selected: boolean;
  distance?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all duration-150 mb-1.5 ${
        selected
          ? "border-amber-400 bg-amber-900/20"
          : "border-transparent hover:border-slate-600 hover:bg-slate-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-100 truncate leading-tight">{client.companyName}</p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">{client.companyCode}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <MapPin className="h-3 w-3 text-slate-500 shrink-0" />
            <span className="text-xs text-slate-400 truncate">{client.city}, {client.state}</span>
          </div>
          {client.fieldPerson && <p className="text-xs text-slate-500 mt-0.5">{client.fieldPerson}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {distance !== undefined && (
            <span className="text-[11px] font-semibold text-amber-400 tabular-nums">
              {distance.toFixed(1)} km
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

let mapsScriptPromise: Promise<void> | null = null;

function loadMapsApi(): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve();
  if (mapsScriptPromise) return mapsScriptPromise;
  mapsScriptPromise = new Promise<void>((resolve, reject) => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&libraries=marker`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return mapsScriptPromise;
}

function createEmojiIcon(emoji: string, size: number): google.maps.Icon {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${Math.round(size * 0.85)}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(emoji, size / 2, size);
  return {
    url: canvas.toDataURL(),
    scaledSize: new window.google.maps.Size(size, size),
    anchor: new window.google.maps.Point(size / 2, size),
  };
}

export default function MapPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("map");

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const clustererRef = useRef<import("@googlemaps/markerclusterer").MarkerClusterer | null>(null);

  const filterParams = committedSearch
    ? /^\d{6}$/.test(committedSearch.trim())
      ? { pinCode: committedSearch.trim() }
      : { city: committedSearch.trim() }
    : {};

  const { data: clients, isLoading: clientsLoading } = useListClients(filterParams);
  const { data: stats, isLoading: statsLoading } = useGetClientStats();
  const { data: nearbyClients, isLoading: nearbyLoading } = useGetNearbyClients(
    { lat: userLocation?.lat ?? 0, lng: userLocation?.lng ?? 0, radius: 50 },
    { query: { enabled: !!userLocation } }
  );

  const displayClients: (Client | ClientWithDistance)[] = userLocation
    ? (Array.isArray(nearbyClients) ? nearbyClients : [])
    : (Array.isArray(clients) ? clients : []);

  // Draw markers
  const updateMarkers = useCallback(async (
    displayList: (Client | ClientWithDistance)[],
    selected: Client | null,
    hasUserLoc: boolean
  ) => {
    if (!googleMapRef.current || !window.google?.maps) return;

    // Clear previous circles
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];

    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (!displayList.length) return;

    const { MarkerClusterer } = await import("@googlemaps/markerclusterer");

    // Coverage circles — group by unique coordinate bucket (≈ same city)
    const cityGroups = new Map<string, { lat: number; lng: number; count: number }>();
    displayList.forEach((client) => {
      const key = `${client.latitude.toFixed(2)},${client.longitude.toFixed(2)}`;
      if (!cityGroups.has(key)) {
        cityGroups.set(key, { lat: client.latitude, lng: client.longitude, count: 0 });
      }
      cityGroups.get(key)!.count++;
    });

    cityGroups.forEach(({ lat, lng, count }) => {
      const circle = new window.google.maps.Circle({
        center: { lat, lng },
        radius: 1500 + count * 600,
        fillColor: "#1e3a5f",
        fillOpacity: 0.10,
        strokeColor: "#1e3a5f",
        strokeOpacity: 0.25,
        strokeWeight: 1.5,
        map: googleMapRef.current!,
        zIndex: 0,
      });
      circlesRef.current.push(circle);
    });

    // 📍 emoji markers via canvas
    const bounds = new window.google.maps.LatLngBounds();

    const newMarkers = displayList.map((client) => {
      const isNearby = hasUserLoc && "distanceKm" in client;
      const isSelected = selected?.id === client.id;
      const size = isSelected ? 40 : isNearby ? 32 : 28;
      const icon = createEmojiIcon("📍", size);

      const marker = new window.google.maps.Marker({
        position: { lat: client.latitude, lng: client.longitude },
        title: client.companyName,
        icon,
        zIndex: isSelected ? 100 : isNearby ? 50 : 10,
      });

      bounds.extend({ lat: client.latitude, lng: client.longitude });

      marker.addListener("click", () => {
        setSelectedClient(client);
        if (infoWindowRef.current && googleMapRef.current) {
          const distHtml = "distanceKm" in client
            ? `<div style="color:#d97706;font-weight:600;font-size:11px;margin-top:6px;">📍 ${(client as ClientWithDistance).distanceKm.toFixed(1)} km away</div>`
            : "";
          infoWindowRef.current.setContent(`
            <div style="font-family:Inter,system-ui,sans-serif;padding:6px 4px;min-width:200px;max-width:240px;">
              <div style="font-weight:700;font-size:14px;color:#0f1e35;line-height:1.3;margin-bottom:3px;">${client.companyName}</div>
              <div style="font-size:11px;color:#6b7280;font-family:monospace;margin-bottom:8px;">${client.companyCode}</div>
              <div style="font-size:12px;color:#374151;margin-bottom:3px;"><span style="color:#9ca3af;">City</span>&nbsp;${client.city}, ${client.state}</div>
              <div style="font-size:12px;color:#374151;margin-bottom:3px;"><span style="color:#9ca3af;">PIN</span>&nbsp;${client.pinCode}</div>
              <div style="font-size:12px;color:#374151;"><span style="color:#9ca3af;">Field</span>&nbsp;${client.fieldPerson}</div>
              ${distHtml}
            </div>
          `);
          infoWindowRef.current.open(googleMapRef.current, marker);
        }
      });

      return marker;
    });

    markersRef.current = newMarkers;
    clustererRef.current = new MarkerClusterer({ map: googleMapRef.current, markers: newMarkers });

    // Auto-fit to show all client pins (only if not following user location)
    if (!hasUserLoc && !selected) {
      googleMapRef.current.fitBounds(bounds, 60);
    }
  }, []);

  // Load Google Maps using official async loader
  useEffect(() => {
    let cancelled = false;
    loadMapsApi()
      .then(() => {
        if (cancelled) return;
        if (!mapRef.current) return;
        const map = new window.google.maps.Map(mapRef.current, {
          center: { lat: 28.6139, lng: 77.2090 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#c9e8f5" }] },
            { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f5f5f5" }] },
            { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
            { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#ebebeb" }] },
            { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#c5cdd7" }] },
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
            { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#a0adb8" }, { weight: 1.5 }] },
            { featureType: "administrative.province", elementType: "geometry.stroke", stylers: [{ color: "#b8c4ce" }, { weight: 1 }] },
          ],
        });
        googleMapRef.current = map;
        infoWindowRef.current = new window.google.maps.InfoWindow();
        setMapReady(true);
      })
      .catch((err) => {
        if (!cancelled) setMapError(String(err));
      });
    return () => { cancelled = true; };
  }, []);

  // Re-draw markers when clients / selection / location changes
  useEffect(() => {
    if (!mapReady || !googleMapRef.current) return;
    updateMarkers(displayClients, selectedClient, !!userLocation);
  }, [displayClients, selectedClient, userLocation, mapReady, updateMarkers]);

  // User location marker
  useEffect(() => {
    if (!mapReady || !googleMapRef.current || !window.google?.maps) return;
    if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null; }
    if (userLocation) {
      userMarkerRef.current = new window.google.maps.Marker({
        position: userLocation,
        map: googleMapRef.current,
        title: "Your Location",
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: "#6366f1",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
        zIndex: 999,
      });
      googleMapRef.current.panTo(userLocation);
      googleMapRef.current.setZoom(10);
    }
  }, [userLocation, mapReady]);

  // Pan to selected client
  useEffect(() => {
    if (selectedClient && googleMapRef.current) {
      googleMapRef.current.panTo({ lat: selectedClient.latitude, lng: selectedClient.longitude });
      const z = googleMapRef.current.getZoom() ?? 5;
      if (z < 8) googleMapRef.current.setZoom(8);
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
      () => { setLocationError("Unable to get location. Please allow access."); setLocationLoading(false); }
    );
  };

  const handleSearch = () => { setCommittedSearch(searchQuery); setUserLocation(null); };

  const handleClearLocation = () => {
    setUserLocation(null);
    if (googleMapRef.current) {
      googleMapRef.current.setCenter({ lat: 28.6139, lng: 77.2090 });
      googleMapRef.current.setZoom(11);
    }
  };

  const cityCount = committedSearch && !userLocation ? (clients?.length ?? 0) : 0;

  const sidebar = (
    <div className="flex flex-col h-full bg-[#0d1929] text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-slate-900" />
          </div>
          <div>
            <h1 className="text-[16px] font-bold text-white leading-tight">LLI Client Map</h1>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">Location Intelligence</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3 shrink-0 border-b border-slate-800 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="City, area, or PIN code..."
              className="w-full pl-8 pr-3 py-2 text-sm bg-slate-800 text-white placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 transition-all"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-3 py-2 bg-amber-400 hover:bg-amber-300 text-slate-900 rounded-lg text-sm font-bold transition-colors shrink-0"
          >
            Go
          </button>
        </div>

        {userLocation ? (
          <button
            onClick={handleClearLocation}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium hover:bg-indigo-600/30 transition-colors"
          >
            <X className="h-3 w-3" />Clear Location
          </button>
        ) : (
          <button
            onClick={handleGetLocation}
            disabled={locationLoading}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {locationLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            {locationLoading ? "Getting Location..." : "Use My Current Location"}
          </button>
        )}
        {locationError && <p className="text-[11px] text-red-400 px-1">{locationError}</p>}
      </div>

      {/* Stats */}
      <div className="px-3 py-3 shrink-0 border-b border-slate-800">
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-[70px] rounded-xl bg-slate-800" />
            <Skeleton className="h-[70px] rounded-xl bg-slate-800" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Users className="h-3 w-3 text-amber-400" />
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Total</span>
              </div>
              <p className="text-2xl font-bold text-white tabular-nums">{stats?.total ?? 0}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">All clients</p>
            </div>
            {userLocation ? (
              <div className="bg-indigo-900/30 border border-indigo-700/40 rounded-xl p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Navigation className="h-3 w-3 text-indigo-400" />
                  <span className="text-[10px] text-indigo-400 uppercase tracking-wider font-semibold">Nearby</span>
                </div>
                {nearbyLoading ? <Loader2 className="h-5 w-5 animate-spin text-indigo-400 mt-1" /> : <p className="text-2xl font-bold text-white tabular-nums">{nearbyClients?.length ?? 0}</p>}
                <p className="text-[10px] text-slate-500 mt-0.5">within 50 km</p>
              </div>
            ) : committedSearch ? (
              <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Building2 className="h-3 w-3 text-amber-400" />
                  <span className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">Filtered</span>
                </div>
                {clientsLoading ? <Loader2 className="h-5 w-5 animate-spin text-amber-400 mt-1" /> : <p className="text-2xl font-bold text-white tabular-nums">{cityCount}</p>}
                <p className="text-[10px] text-slate-500 mt-0.5 truncate">{committedSearch}</p>
              </div>
            ) : (
              <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <TrendingUp className="h-3 w-3 text-emerald-400" />
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Cities</span>
                </div>
                <p className="text-2xl font-bold text-white tabular-nums">{stats?.byCity?.length ?? 0}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Covered</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Client list */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-3 py-2 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
            {userLocation ? "Nearby Clients" : committedSearch ? "Results" : "All Clients"}
          </span>
          {!clientsLoading && !nearbyLoading && (
            <span className="text-[10px] text-slate-600 tabular-nums">{displayClients.length} shown</span>
          )}
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-3 pb-4">
            {(clientsLoading || nearbyLoading) ? (
              Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-lg mb-1.5 bg-slate-800" />)
            ) : displayClients.length === 0 ? (
              <div className="text-center py-10">
                <MapPin className="h-9 w-9 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500 font-medium">No clients found</p>
                {committedSearch && <p className="text-[11px] text-slate-600 mt-1">Try a different search</p>}
              </div>
            ) : (
              displayClients.map((client) => (
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
    </div>
  );

  const mapPanel = (
    <div className="relative flex-1 h-full min-w-0">
      {/* Loading overlay */}
      {!mapReady && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-20">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#1e3a5f] mx-auto mb-2" />
            <p className="text-sm text-slate-500">Loading map…</p>
          </div>
        </div>
      )}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-20 p-6">
          <div className="text-center max-w-sm">
            <MapPin className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 mb-1">Map failed to load</p>
            <p className="text-xs text-slate-500">{mapError}</p>
          </div>
        </div>
      )}

      {/* Map container — always in DOM so dimensions are stable */}
      <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

      {/* Legend */}
      {mapReady && (
        <div className="absolute bottom-6 left-4 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-3 shadow-lg text-xs z-10 pointer-events-none">
          <p className="font-bold text-slate-700 text-[10px] uppercase tracking-widest mb-2">Legend</p>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2"><span className="text-base leading-none">📍</span><span className="text-slate-600">Client location</span></div>
            {userLocation && <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#6366f1] border-2 border-white shadow-sm shrink-0" /><span className="text-slate-600">You</span></div>}
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#1e3a5f]/30 border border-[#1e3a5f]/40 shrink-0" /><span className="text-slate-600">Coverage area</span></div>
          </div>
        </div>
      )}

      {/* Selected client overlay */}
      {selectedClient && (
        <div className="absolute top-4 right-4 bg-white/97 backdrop-blur-sm border border-slate-200 rounded-xl p-4 shadow-xl max-w-[240px] z-10">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 leading-tight">{selectedClient.companyName}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{selectedClient.companyCode}</p>
            </div>
            <button onClick={() => setSelectedClient(null)} className="text-slate-400 hover:text-slate-700 transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs text-slate-600"><span className="font-semibold text-slate-800">City</span>&nbsp;{selectedClient.city}, {selectedClient.state}</p>
            <p className="text-xs text-slate-600"><span className="font-semibold text-slate-800">PIN</span>&nbsp;{selectedClient.pinCode}</p>
            {selectedClient.fieldPerson && <p className="text-xs text-slate-600"><span className="font-semibold text-slate-800">Field</span>&nbsp;{selectedClient.fieldPerson}</p>}
          </div>
          <div className="mt-3"><StatusBadge status={selectedClient.status} /></div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:flex h-screen w-full overflow-hidden">
        <div className="w-80 xl:w-96 h-full flex flex-col shrink-0 border-r border-slate-800">{sidebar}</div>
        {mapPanel}
      </div>

      {/* Mobile */}
      <div className="flex md:hidden flex-col h-screen w-full overflow-hidden">
        <div className="flex bg-[#0d1929] border-b border-slate-800 shrink-0">
          <button onClick={() => setMobileTab("map")} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${mobileTab === "map" ? "text-amber-400 border-b-2 border-amber-400" : "text-slate-500"}`}>
            <MapPin className="h-3.5 w-3.5" />&nbsp;Map
          </button>
          <button onClick={() => setMobileTab("list")} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${mobileTab === "list" ? "text-amber-400 border-b-2 border-amber-400" : "text-slate-500"}`}>
            <Users className="h-3.5 w-3.5" />&nbsp;Clients ({displayClients.length})
          </button>
        </div>
        {mobileTab === "map"
          ? <div className="flex-1 relative overflow-hidden">{mapPanel}</div>
          : <div className="flex-1 overflow-hidden">{sidebar}</div>}
      </div>
    </>
  );
}
