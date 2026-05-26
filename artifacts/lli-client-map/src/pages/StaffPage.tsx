import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";
import { useListClients } from "@workspace/api-client-react";
import {
  MapPin, User, Monitor, ChevronLeft, Loader2, Building2,
  Trophy, Medal, Star, TrendingUp, Users, Map as MapIcon, List,
  ChevronRight, Hash, Search,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

setOptions({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string, v: "weekly" });

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
type MobileTab = "leaderboard" | "clients" | "map";

type StaffMember = {
  name: string;
  clients: Client[];
  cities: Set<string>;
  states: Set<string>;
  topCity: string;
};

const DELHI = { lat: 28.6139, lng: 77.209 };

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#dbeafe" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f8fafc" }] },
  { featureType: "landscape.man_made", stylers: [{ color: "#f1f5f9" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e2e8f0" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#64748b" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
];

const AVATAR_PALETTE = [
  "#10b981","#6366f1","#8b5cf6","#f43f5e","#f59e0b",
  "#06b6d4","#d946ef","#14b8a6","#3b82f6","#ec4899",
];

function nameHash(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h;
}
function avatarBg(name: string) { return AVATAR_PALETTE[nameHash(name) % AVATAR_PALETTE.length]; }
function initials(name: string) { return name.split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2); }

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-yellow-300 to-amber-500 flex items-center justify-center shadow-sm shrink-0"><Trophy className="h-3.5 w-3.5 text-white" /></div>;
  if (rank === 2) return <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center shadow-sm shrink-0"><Medal className="h-3.5 w-3.5 text-white" /></div>;
  if (rank === 3) return <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-orange-300 to-amber-600 flex items-center justify-center shadow-sm shrink-0"><Star className="h-3.5 w-3.5 text-white" /></div>;
  return <div className="w-7 h-7 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0"><span className="text-[10px] text-slate-500 font-bold tabular-nums">{rank}</span></div>;
}

function makePin(color: string, isSelected: boolean): google.maps.Icon {
  const W = 22, R = W / 2, tail = 10, pad = 3;
  const cW = W + 8, cH = pad + W + tail + 2;
  const cv = document.createElement("canvas"); cv.width = cW; cv.height = cH;
  const ctx = cv.getContext("2d")!;
  const cx = cW / 2, cy = pad + R, tip = pad + W + tail;

  if (isSelected) { ctx.beginPath(); ctx.arc(cx, cy, R + 5, 0, Math.PI * 2); ctx.fillStyle = "rgba(251,191,36,0.22)"; ctx.fill(); }
  ctx.shadowColor = "rgba(0,0,0,0.22)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
  ctx.beginPath(); ctx.moveTo(cx, tip); ctx.bezierCurveTo(cx-R*0.6,cy+R*0.8,cx-R,cy,cx-R,cy); ctx.arc(cx,cy,R,Math.PI,0); ctx.bezierCurveTo(cx+R,cy,cx+R*0.6,cy+R*0.8,cx,tip); ctx.closePath();
  ctx.fillStyle = isSelected ? "#f59e0b" : color; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.beginPath(); ctx.moveTo(cx,tip); ctx.bezierCurveTo(cx-R*0.6,cy+R*0.8,cx-R,cy,cx-R,cy); ctx.arc(cx,cy,R,Math.PI,0); ctx.bezierCurveTo(cx+R,cy,cx+R*0.6,cy+R*0.8,cx,tip); ctx.closePath(); ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,R*0.28,0,Math.PI*2); ctx.fillStyle="rgba(255,255,255,0.88)"; ctx.fill();
  return { url: cv.toDataURL(), scaledSize: new google.maps.Size(cW,cH), anchor: new google.maps.Point(cx,tip) };
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-emerald-400", nil: "bg-slate-300", hold: "bg-orange-400", prospect: "bg-amber-400", office: "bg-blue-400"
  };
  return <span className={`w-2 h-2 rounded-full shrink-0 ${colors[status.toLowerCase()] ?? "bg-slate-300"}`} />;
}

export default function StaffPage() {
  const { data: rawClients, isLoading } = useListClients({}, { query: { staleTime: 5*60*1000, queryKey: ["clients-staff-v2"] } });

  const [teamType, setTeamType] = useState<TeamType>("field");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("leaderboard");
  const [mapReady, setMapReady] = useState(false);
  const [search, setSearch] = useState("");

  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);

  const clients = useMemo(() => (Array.isArray(rawClients) ? rawClients : []) as Client[], [rawClients]);

  const staffMap = useMemo(() => {
    const map = new Map<string, StaffMember>();
    for (const c of clients) {
      const name = teamType === "field" ? c.fieldPerson : (c.computerPerson ?? "");
      if (!name) continue;
      if (!map.has(name)) map.set(name, { name, clients: [], cities: new Set(), states: new Set(), topCity: "" });
      const m = map.get(name)!;
      m.clients.push(c);
      if (c.city) m.cities.add(c.city);
      if (c.state) m.states.add(c.state);
    }
    // compute topCity
    map.forEach(m => {
      const freq = new Map<string, number>();
      m.clients.forEach(c => freq.set(c.city, (freq.get(c.city) ?? 0) + 1));
      m.topCity = [...freq.entries()].sort((a,b) => b[1]-a[1])[0]?.[0] ?? "";
    });
    return map;
  }, [clients, teamType]);

  const staffList = useMemo(() =>
    [...staffMap.values()]
      .sort((a,b) => b.clients.length - a.clients.length)
      .filter(m => !search || m.name.toLowerCase().includes(search.toLowerCase())),
    [staffMap, search]
  );

  const selectedMember = selectedName ? staffMap.get(selectedName) ?? null : null;
  const displayClients = selectedMember ? selectedMember.clients : clients;

  const totalClients = useMemo(() => [...staffMap.values()].reduce((s,m) => s+m.clients.length, 0), [staffMap]);
  const totalCities = useMemo(() => { const s = new Set<string>(); staffMap.forEach(m => m.cities.forEach(c => s.add(c))); return s.size; }, [staffMap]);
  const maxCount = staffList[0]?.clients.length ?? 1;

  // Coverage score: how many distinct cities covered / total cities * clients
  function coverageScore(m: StaffMember) { return Math.round((m.cities.size / Math.max(1, totalCities)) * 100); }

  // Map init
  useEffect(() => {
    (async () => {
      try {
        const { Map } = await importLibrary("maps") as google.maps.MapsLibrary;
        if (!mapRef.current) return;
        googleMapRef.current = new Map(mapRef.current, {
          center: DELHI, zoom: 10, styles: MAP_STYLES,
          disableDefaultUI: true, gestureHandling: "greedy", clickableIcons: false,
        });
        setMapReady(true);
      } catch { /* ignore */ }
    })();
  }, []);

  const updateMap = useCallback((list: Client[], personName: string | null) => {
    if (!googleMapRef.current || typeof google === "undefined") return;
    markersRef.current.forEach(m => m.setMap(null)); markersRef.current = [];
    circlesRef.current.forEach(c => c.setMap(null)); circlesRef.current = [];
    if (!list.length) return;

    const color = personName ? avatarBg(personName) : "#10b981";

    // Territory circles
    const cityGroups = new Map<string, {lat:number;lng:number;count:number}>();
    list.forEach(c => {
      const k = `${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`;
      if (!cityGroups.has(k)) cityGroups.set(k, {lat:c.latitude,lng:c.longitude,count:0});
      cityGroups.get(k)!.count++;
    });
    cityGroups.forEach(({lat,lng,count}) => {
      circlesRef.current.push(new google.maps.Circle({
        center:{lat,lng}, radius:900+count*500,
        fillColor: color, fillOpacity:0.1,
        strokeColor: color, strokeOpacity:0.28, strokeWeight:1.5,
        map:googleMapRef.current!, zIndex:0,
      }));
    });

    const bounds = new google.maps.LatLngBounds();
    list.forEach(c => {
      const icon = makePin(color, false);
      const marker = new google.maps.Marker({
        position:{lat:c.latitude,lng:c.longitude},
        map:googleMapRef.current!, icon, title:c.companyName,
      });
      const iw = new google.maps.InfoWindow({
        content:`<div style="font-family:Inter,sans-serif;padding:4px 2px;min-width:150px">
          <p style="font-weight:700;font-size:12px;color:#0f172a;margin:0 0 3px">${c.companyName}</p>
          <p style="font-size:10px;color:#64748b;margin:0 0 2px">${c.city}, ${c.state}</p>
          <p style="font-size:10px;color:#94a3b8;margin:0;font-family:monospace"># ${c.pinCode}</p>
        </div>`,
      });
      marker.addListener("click", () => iw.open(googleMapRef.current, marker));
      markersRef.current.push(marker);
      bounds.extend({lat:c.latitude,lng:c.longitude});
    });

    if (list.length === 1) {
      googleMapRef.current.setCenter({lat:list[0].latitude,lng:list[0].longitude});
      googleMapRef.current.setZoom(13);
    } else {
      googleMapRef.current.fitBounds(bounds, {top:60,right:60,bottom:60,left:60});
    }
  }, []);

  useEffect(() => {
    if (mapReady) updateMap(displayClients, selectedName);
  }, [mapReady, displayClients, selectedName, updateMap]);

  const teamColor = teamType === "field" ? "emerald" : "violet";
  const teamIcon = teamType === "field" ? <User className="h-3 w-3" /> : <Monitor className="h-3 w-3" />;

  // ─── Leaderboard Panel ───────────────────────────────────────
  const leaderboardPanel = (
    <div className="flex flex-col h-full bg-white overflow-hidden border-r border-slate-100">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5 mb-4">
          <Link to="/" className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-bold text-slate-900 leading-tight">Team Performance</h1>
            <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-widest">Staff Leaderboard</p>
          </div>
        </div>

        {/* Team toggle */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-3">
          {(["field","computer"] as TeamType[]).map(t => (
            <button key={t} onClick={() => { setTeamType(t); setSelectedName(null); setSearch(""); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                teamType === t ? `bg-white shadow-sm ${t === "field" ? "text-emerald-600" : "text-violet-600"}` : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "field" ? <User className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
              {t === "field" ? "Field" : "Computer"}
            </button>
          ))}
        </div>

        {/* Summary chips */}
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-2 text-center">
            <p className="text-[9px] text-slate-400 uppercase tracking-wide mb-0.5">Members</p>
            <p className="text-[16px] font-bold text-slate-700 tabular-nums leading-none">{staffMap.size}</p>
          </div>
          <div className={`bg-${teamColor}-50 border border-${teamColor}-100 rounded-xl p-2 text-center`}>
            <p className={`text-[9px] text-${teamColor}-400 uppercase tracking-wide mb-0.5`}>Clients</p>
            <p className={`text-[16px] font-bold text-${teamColor}-600 tabular-nums leading-none`}>{totalClients}</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2 text-center">
            <p className="text-[9px] text-indigo-400 uppercase tracking-wide mb-0.5">Cities</p>
            <p className="text-[16px] font-bold text-indigo-600 tabular-nums leading-none">{totalCities}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search person…"
            className="w-full pl-7 pr-3 py-2 text-[12px] bg-slate-50 border border-slate-200 rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-amber-300 focus:ring-1 focus:ring-amber-100"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-2 space-y-1.5">
          {isLoading ? (
            Array.from({length:6}).map((_,i) => <Skeleton key={i} className="h-[88px] rounded-2xl bg-slate-100" />)
          ) : staffList.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-[12px] text-slate-400">No staff found</p>
            </div>
          ) : staffList.map((member, idx) => {
            const rank = staffList.findIndex(m => m.name === member.name) + 1;
            const isSelected = selectedName === member.name;
            const pct = Math.round((member.clients.length / maxCount) * 100);
            const score = coverageScore(member);
            const bg = avatarBg(member.name);
            return (
              <button
                key={member.name}
                onClick={() => {
                  setSelectedName(isSelected ? null : member.name);
                  setMobileTab("clients");
                }}
                className={`w-full text-left p-3 rounded-2xl border transition-all active:scale-[0.99] ${
                  isSelected
                    ? teamType === "field"
                      ? "bg-emerald-50 border-emerald-200 ring-1 ring-emerald-200"
                      : "bg-violet-50 border-violet-200 ring-1 ring-violet-200"
                    : "bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50/80"
                }`}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <RankBadge rank={rank} />
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shrink-0" style={{background:bg}}>
                    {initials(member.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-slate-800 truncate leading-tight">{member.name}</p>
                    <p className="text-[9px] text-slate-400 mt-0.5 truncate">
                      {member.topCity && <span>📍 {member.topCity}</span>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-[20px] font-black tabular-nums leading-none ${isSelected ? (teamType==="field" ? "text-emerald-600":"text-violet-600") : "text-slate-700"}`}>
                      {member.clients.length}
                    </p>
                    <p className="text-[8px] text-slate-400 uppercase tracking-wide">clients</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isSelected ? (teamType==="field"?"bg-emerald-400":"bg-violet-400") : "bg-slate-300"}`}
                    style={{width:`${pct}%`}}
                  />
                </div>

                {/* Footer chips */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
                    <MapPin className="h-2 w-2" />{member.cities.size} cities
                  </span>
                  <span className="text-slate-200 text-[9px]">·</span>
                  <span className="text-[9px] text-slate-400">{member.states.size} states</span>
                  <span className="text-slate-200 text-[9px]">·</span>
                  <span className="flex items-center gap-0.5 text-[9px] text-indigo-400 font-semibold">
                    <TrendingUp className="h-2 w-2" />{score}% coverage
                  </span>
                  {rank <= 3 && (
                    <span className="ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-600">
                      #{rank}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  // ─── Client Detail Panel ─────────────────────────────────────
  const clientDetailPanel = (
    <div className="flex flex-col h-full bg-white border-r border-slate-100 overflow-hidden">
      {selectedMember ? (
        <>
          {/* Person header */}
          <div className="px-4 pt-5 pb-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-[14px] font-bold shadow-sm shrink-0"
                style={{background:avatarBg(selectedMember.name)}}>
                {initials(selectedMember.name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold text-slate-900 leading-tight">{selectedMember.name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold ${
                    teamType === "field" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"
                  }`}>
                    {teamIcon}
                    {teamType === "field" ? "Field" : "Computer"}
                  </span>
                  <span className="text-slate-200 text-[9px]">·</span>
                  <span className="text-[9px] text-slate-400">Rank #{staffList.findIndex(m=>m.name===selectedMember.name)+1}</span>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className={`bg-${teamColor}-50 border border-${teamColor}-100 rounded-xl p-2.5`}>
                <p className={`text-[8px] text-${teamColor}-400 uppercase tracking-wide mb-0.5`}>Clients</p>
                <p className={`text-[20px] font-black text-${teamColor}-600 tabular-nums leading-none`}>{selectedMember.clients.length}</p>
              </div>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-2.5">
                <p className="text-[8px] text-indigo-400 uppercase tracking-wide mb-0.5">Cities</p>
                <p className="text-[20px] font-black text-indigo-600 tabular-nums leading-none">{selectedMember.cities.size}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                <p className="text-[8px] text-slate-400 uppercase tracking-wide mb-0.5">States</p>
                <p className="text-[20px] font-black text-slate-700 tabular-nums leading-none">{selectedMember.states.size}</p>
              </div>
            </div>

            {/* Coverage bar */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-slate-400 uppercase tracking-wide flex items-center gap-1"><TrendingUp className="h-2.5 w-2.5" />Coverage Score</span>
                <span className="text-[11px] font-bold text-indigo-600">{coverageScore(selectedMember)}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full" style={{width:`${coverageScore(selectedMember)}%`}} />
              </div>
            </div>
          </div>

          {/* City chips */}
          <div className="px-3 py-2.5 border-b border-slate-100 shrink-0">
            <p className="text-[8px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">Cities covered</p>
            <div className="flex flex-wrap gap-1">
              {[...selectedMember.cities].sort().map(city => (
                <span key={city} className="px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-lg text-[9px] font-medium">{city}</span>
              ))}
            </div>
          </div>

          {/* Client list */}
          <div className="px-3 pt-2.5 pb-1 shrink-0 flex items-center justify-between">
            <span className="text-[8px] text-slate-400 uppercase tracking-widest font-bold">All Clients</span>
            <span className="text-[10px] text-slate-400 font-mono tabular-nums">{selectedMember.clients.length}</span>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-3 pb-6 space-y-1">
              {[...selectedMember.clients].sort((a,b) => a.city.localeCompare(b.city)).map(c => (
                <div key={c.id} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-slate-100 transition-colors">
                  <StatusDot status={c.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-slate-800 truncate leading-tight">{c.companyName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-slate-400 truncate">{c.city}</span>
                      {c.pinCode && (
                        <>
                          <span className="text-slate-200 text-[9px]">·</span>
                          <span className="text-[9px] text-rose-400 font-mono flex items-center gap-0.5"><Hash className="h-2 w-2" />{c.pinCode}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[8px] text-slate-300 font-mono shrink-0">{c.companyCode}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-3">
            <ChevronRight className="h-6 w-6 text-slate-300" />
          </div>
          <p className="text-[13px] font-semibold text-slate-600 mb-1">Select a team member</p>
          <p className="text-[11px] text-slate-400 leading-relaxed">Click any person in the leaderboard to see their full client list and map coverage</p>
        </div>
      )}
    </div>
  );

  // ─── Map Panel ───────────────────────────────────────────────
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
      <div ref={mapRef} style={{position:"absolute",inset:0}} />

      {/* Zoom controls */}
      {mapReady && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 z-10">
          <button onClick={() => googleMapRef.current?.setZoom((googleMapRef.current.getZoom()??10)+1)} className="w-9 h-9 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 text-lg font-light flex items-center justify-center shadow-sm">+</button>
          <button onClick={() => googleMapRef.current?.setZoom((googleMapRef.current.getZoom()??10)-1)} className="w-9 h-9 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 text-lg font-light flex items-center justify-center shadow-sm">−</button>
        </div>
      )}

      {/* Floating chip */}
      {mapReady && (
        <div className="absolute top-4 left-4 z-10">
          {selectedMember ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-2xl shadow-lg border border-slate-100">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{background:avatarBg(selectedMember.name)}}>
                {initials(selectedMember.name)}
              </div>
              <span className="text-[11px] font-bold text-slate-700">{selectedMember.name}</span>
              <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-bold ${teamType==="field" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
                {selectedMember.clients.length} clients
              </span>
              <button onClick={() => setSelectedName(null)} className="text-slate-300 hover:text-slate-500 transition-colors text-xs leading-none ml-1">✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-white/90 rounded-2xl shadow border border-slate-100 text-[11px] text-slate-500">
              <MapIcon className="h-3.5 w-3.5 text-slate-400" />
              All {clients.length} clients — select a person to filter
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-dvh w-full flex flex-col bg-slate-50 overflow-hidden">

      {/* ── Mobile layout ── */}
      <div className="md:hidden flex flex-col h-full">
        {/* Tab bar */}
        <div className="flex shrink-0 bg-white border-b border-slate-100">
          {([["leaderboard","Leaderboard",<Users className="h-3.5 w-3.5" key="u" />],
             ["clients","Clients",<List className="h-3.5 w-3.5" key="l" />],
             ["map","Map",<MapIcon className="h-3.5 w-3.5" key="m" />]] as [MobileTab,string,React.ReactNode][]).map(([tab,label,icon]) => (
            <button key={tab} onClick={() => setMobileTab(tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[11px] font-semibold transition-colors border-b-2 ${
                mobileTab === tab ? "text-indigo-600 border-indigo-400" : "text-slate-400 border-transparent"
              }`}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 relative">
          <div className={`absolute inset-0 transition-opacity ${mobileTab==="leaderboard" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}>{leaderboardPanel}</div>
          <div className={`absolute inset-0 transition-opacity ${mobileTab==="clients" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}>{clientDetailPanel}</div>
          <div className={`absolute inset-0 transition-opacity ${mobileTab==="map" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"}`}>{mapPanel}</div>
        </div>
      </div>

      {/* ── Desktop layout — 3 columns ── */}
      <div className="hidden md:flex h-full">
        <div className="w-[300px] shrink-0 h-full">{leaderboardPanel}</div>
        <div className="w-[310px] shrink-0 h-full">{clientDetailPanel}</div>
        <div className="flex-1 h-full">{mapPanel}</div>
      </div>
    </div>
  );
}
