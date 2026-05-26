import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { useListClients } from "@workspace/api-client-react";
import {
  MapPin, User, Monitor, ChevronLeft, Loader2, Building2, LayoutGrid,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

setOptions({
  key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
  v: "weekly",
});

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
  computerPerson?: string;
  status: string;
};

type TeamType = "field" | "computer";

type StaffMember = {
  name: string;
  clients: Client[];
  cities: Set<string>;
  states: Set<string>;
};

const DELHI = { lat: 28.6139, lng: 77.209 };

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbeafe" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f8fafc" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#f1f5f9" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
];

function initials(name: string) {
  return name.split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  "bg-emerald-500", "bg-indigo-500", "bg-violet-500", "bg-rose-500",
  "bg-amber-500", "bg-cyan-500", "bg-fuchsia-500", "bg-teal-500",
];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function makeStaffMarker(name: string, isSelected: boolean): google.maps.Icon {
  const pinW = 26;
  const pinR = pinW / 2;
  const tailH = 12;
  const topPad = 3;
  const canvasW = pinW + 8;
  const canvasH = topPad + pinW + tailH + 2;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  const cx = canvasW / 2;
  const cy = topPad + pinR;
  const tipY = topPad + pinW + tailH;

  const COLORS = ["#10b981","#6366f1","#8b5cf6","#f43f5e","#f59e0b","#06b6d4","#d946ef","#14b8a6"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  const fillColor = isSelected ? "#f59e0b" : COLORS[hash % COLORS.length];

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(cx, cy, pinR + 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(251,191,36,0.22)";
    ctx.fill();
  }

  ctx.shadowColor = "rgba(0,0,0,0.24)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(cx - pinR * 0.6, cy + pinR * 0.8, cx - pinR, cy, cx - pinR, cy);
  ctx.arc(cx, cy, pinR, Math.PI, 0);
  ctx.bezierCurveTo(cx + pinR, cy, cx + pinR * 0.6, cy + pinR * 0.8, cx, tipY);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.bezierCurveTo(cx - pinR * 0.6, cy + pinR * 0.8, cx - pinR, cy, cx - pinR, cy);
  ctx.arc(cx, cy, pinR, Math.PI, 0);
  ctx.bezierCurveTo(cx + pinR, cy, cx + pinR * 0.6, cy + pinR * 0.8, cx, tipY);
  ctx.closePath();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, pinR * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();

  return {
    url: canvas.toDataURL(),
    scaledSize: new google.maps.Size(canvasW, canvasH),
    anchor: new google.maps.Point(cx, tipY),
  };
}

export default function StaffPage() {
  const { data: rawClients, isLoading } = useListClients(
    {},
    { query: { staleTime: 5 * 60 * 1000, queryKey: ["clients-staff-page"] } }
  );

  const [teamType, setTeamType] = useState<TeamType>("field");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");
  const [mapReady, setMapReady] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);

  const clients = useMemo(() => (Array.isArray(rawClients) ? rawClients : []) as Client[], [rawClients]);

  const staffMap = useMemo(() => {
    const map = new Map<string, StaffMember>();
    for (const c of clients) {
      const name = teamType === "field" ? c.fieldPerson : (c.computerPerson ?? "");
      if (!name) continue;
      if (!map.has(name)) map.set(name, { name, clients: [], cities: new Set(), states: new Set() });
      const m = map.get(name)!;
      m.clients.push(c);
      if (c.city) m.cities.add(c.city);
      if (c.state) m.states.add(c.state);
    }
    return map;
  }, [clients, teamType]);

  const staffList = useMemo(() =>
    [...staffMap.values()].sort((a, b) => b.clients.length - a.clients.length),
    [staffMap]
  );

  const selectedMember = selectedName ? staffMap.get(selectedName) ?? null : null;
  const displayClients = selectedMember ? selectedMember.clients : clients;

  // Map init
  useEffect(() => {
    (async () => {
      try {
        const { Map } = await importLibrary("maps") as google.maps.MapsLibrary;
        if (!mapRef.current) return;
        googleMapRef.current = new Map(mapRef.current, {
          center: DELHI,
          zoom: 10,
          styles: MAP_STYLES,
          disableDefaultUI: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        setMapReady(true);
      } catch { /* ignore */ }
    })();
  }, []);

  const updateMarkers = useCallback((list: Client[], selName: string | null) => {
    if (!googleMapRef.current || typeof google === "undefined") return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (!list.length) return;

    const bounds = new google.maps.LatLngBounds();
    list.forEach(c => {
      const icon = makeStaffMarker(selName ?? c.fieldPerson, !!selName);
      const marker = new google.maps.Marker({
        position: { lat: c.latitude, lng: c.longitude },
        map: googleMapRef.current!,
        icon,
        title: c.companyName,
      });
      const iw = new google.maps.InfoWindow({
        content: `<div style="font-family:Inter,sans-serif;padding:4px 2px;min-width:140px">
          <p style="font-weight:700;font-size:12px;color:#0f172a;margin:0 0 2px">${c.companyName}</p>
          <p style="font-size:10px;color:#64748b;margin:0">${c.city}, ${c.state}</p>
        </div>`,
      });
      marker.addListener("click", () => iw.open(googleMapRef.current, marker));
      markersRef.current.push(marker);
      bounds.extend({ lat: c.latitude, lng: c.longitude });
    });

    if (list.length === 1) {
      googleMapRef.current.setCenter({ lat: list[0].latitude, lng: list[0].longitude });
      googleMapRef.current.setZoom(13);
    } else {
      googleMapRef.current.fitBounds(bounds, { top: 60, right: 60, bottom: 60, left: 60 });
    }
  }, []);

  useEffect(() => {
    if (mapReady) updateMarkers(displayClients, selectedName);
  }, [mapReady, displayClients, selectedName, updateMarkers]);

  const sidebar = (
    <div className="flex flex-col h-full bg-white border-r border-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold text-slate-900 leading-tight tracking-tight">Team Performance</h1>
            <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-widest">Staff Overview</p>
          </div>
        </div>

        {/* Team type toggle */}
        <div className="flex gap-1 mt-3 p-1 bg-slate-100 rounded-xl">
          <button
            onClick={() => { setTeamType("field"); setSelectedName(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              teamType === "field" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <User className="h-3 w-3" /> Field Team
          </button>
          <button
            onClick={() => { setTeamType("computer"); setSelectedName(null); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              teamType === "computer" ? "bg-white text-violet-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Monitor className="h-3 w-3" /> Computer Team
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-2.5 border-b border-slate-100 shrink-0 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${teamType === "field" ? "bg-emerald-400" : "bg-violet-400"}`} />
          <span className="text-[11px] text-slate-500">{staffList.length} members</span>
        </div>
        <span className="text-slate-200">|</span>
        <span className="text-[11px] text-slate-500">{clients.length} clients total</span>
        {selectedName && (
          <>
            <span className="text-slate-200">|</span>
            <button
              onClick={() => setSelectedName(null)}
              className="text-[10px] text-amber-600 font-semibold hover:text-amber-700"
            >
              Clear filter
            </button>
          </>
        )}
      </div>

      {/* Staff list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-3 space-y-1.5">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-2xl bg-slate-100" />
            ))
          ) : staffList.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-3">
                <User className="h-5 w-5 text-slate-300" />
              </div>
              <p className="text-[13px] text-slate-500">No staff found</p>
            </div>
          ) : staffList.map(member => {
            const isSelected = selectedName === member.name;
            const pct = Math.round((member.clients.length / Math.max(1, staffList[0].clients.length)) * 100);
            return (
              <button
                key={member.name}
                onClick={() => {
                  setSelectedName(isSelected ? null : member.name);
                  setMobileTab("map");
                }}
                className={`w-full text-left p-3 rounded-2xl border transition-all ${
                  isSelected
                    ? teamType === "field"
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-violet-50 border-violet-200"
                    : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${avatarColor(member.name)}`}>
                    {initials(member.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-bold truncate ${isSelected ? (teamType === "field" ? "text-emerald-800" : "text-violet-800") : "text-slate-800"}`}>
                      {member.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-0.5 text-[9px] text-slate-400">
                        <Building2 className="h-2.5 w-2.5" />
                        {member.clients.length} clients
                      </span>
                      <span className="text-slate-200">·</span>
                      <span className="flex items-center gap-0.5 text-[9px] text-slate-400">
                        <MapPin className="h-2.5 w-2.5" />
                        {member.cities.size} {member.cities.size === 1 ? "city" : "cities"}
                      </span>
                      <span className="text-slate-200">·</span>
                      <span className="text-[9px] text-slate-400">{member.states.size} {member.states.size === 1 ? "state" : "states"}</span>
                    </div>
                  </div>
                  <span className={`text-[13px] font-bold tabular-nums shrink-0 ${isSelected ? (teamType === "field" ? "text-emerald-600" : "text-violet-600") : "text-slate-500"}`}>
                    {member.clients.length}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isSelected ? (teamType === "field" ? "bg-emerald-400" : "bg-violet-400") : "bg-slate-300"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  const mapPanel = (
    <div className="relative flex-1 h-full min-w-0 bg-slate-100">
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-20">
          <div className="text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto mb-3">
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            </div>
            <p className="text-[12px] text-slate-400">Loading map…</p>
          </div>
        </div>
      )}
      <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

      {/* Zoom controls */}
      {mapReady && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
          <button
            onClick={() => googleMapRef.current?.setZoom((googleMapRef.current.getZoom() ?? 10) + 1)}
            className="w-9 h-9 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 text-lg font-light flex items-center justify-center shadow-sm"
          >+</button>
          <button
            onClick={() => googleMapRef.current?.setZoom((googleMapRef.current.getZoom() ?? 10) - 1)}
            className="w-9 h-9 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 text-lg font-light flex items-center justify-center shadow-sm"
          >−</button>
        </div>
      )}

      {/* Selected person chip */}
      {selectedMember && (
        <div className="absolute top-4 left-4 z-10">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl shadow-lg border text-[11px] font-semibold ${
            teamType === "field" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-violet-50 border-violet-200 text-violet-800"
          }`}>
            <div className={`w-5 h-5 rounded-md flex items-center justify-center text-white text-[8px] font-bold shrink-0 ${avatarColor(selectedMember.name)}`}>
              {initials(selectedMember.name)}
            </div>
            {selectedMember.name}
            <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-bold ml-1 ${teamType === "field" ? "bg-emerald-200 text-emerald-700" : "bg-violet-200 text-violet-700"}`}>
              {selectedMember.clients.length} clients
            </span>
          </div>
        </div>
      )}

      {/* All clients info when nothing selected */}
      {!selectedMember && mapReady && (
        <div className="absolute top-4 left-4 z-10">
          <div className="flex items-center gap-2 px-3 py-2 bg-white/90 rounded-2xl shadow border border-slate-100 text-[11px] text-slate-500">
            <LayoutGrid className="h-3 w-3 text-slate-400" />
            Showing all {clients.length} clients — tap a person to filter
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-dvh w-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Mobile layout */}
      <div className="md:hidden flex flex-col h-full">
        {/* Mobile tab bar */}
        <div className="flex shrink-0 bg-white border-b border-slate-100">
          <button
            onClick={() => setMobileTab("list")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[12px] font-semibold transition-colors border-b-2 ${
              mobileTab === "list" ? "text-indigo-600 border-indigo-400" : "text-slate-400 border-transparent"
            }`}
          >
            <User className="h-3.5 w-3.5" /> Team
          </button>
          <button
            onClick={() => setMobileTab("map")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[12px] font-semibold transition-colors border-b-2 ${
              mobileTab === "map" ? "text-indigo-600 border-indigo-400" : "text-slate-400 border-transparent"
            }`}
          >
            <MapPin className="h-3.5 w-3.5" /> Map
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
          <div className={`absolute inset-0 ${mobileTab === "list" ? "" : "pointer-events-none opacity-0"}`}>
            {sidebar}
          </div>
          <div className={`absolute inset-0 ${mobileTab === "map" ? "" : "pointer-events-none opacity-0"}`}>
            {mapPanel}
          </div>
        </div>
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex h-full">
        <div className="w-[320px] shrink-0 h-full">{sidebar}</div>
        <div className="flex-1 h-full">{mapPanel}</div>
      </div>
    </div>
  );
}
