import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, MapPin, Filter, ChevronDown, ChevronUp } from "lucide-react";

type FlaggedItem = {
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
};

type QualityResult = {
  totalChecked: number;
  flaggedCount: number;
  thresholdKm: number;
  checkedAt: string;
  items: FlaggedItem[];
};

function SeverityBadge({ severity, km }: { severity: "high" | "medium"; km: number }) {
  if (severity === "high") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        {km} km off
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      {km} km off
    </span>
  );
}

function ClientRow({ item }: { item: FlaggedItem }) {
  const [expanded, setExpanded] = useState(false);

  const storedMapsUrl = `https://www.google.com/maps?q=${item.storedLat},${item.storedLng}`;
  const expectedMapsUrl = `https://www.google.com/maps?q=${item.expectedLat},${item.expectedLng}`;
  const compareUrl = `https://www.google.com/maps/dir/${item.expectedLat},${item.expectedLng}/${item.storedLat},${item.storedLng}`;

  return (
    <div className={`rounded-2xl border transition-all ${item.severity === "high" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/30"}`}>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-slate-900 truncate">{item.companyName}</span>
            <span className="text-[10px] font-mono text-slate-400 shrink-0">{item.companyCode}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              <MapPin className="h-2.5 w-2.5" /> {item.city}
            </span>
            <span className="text-[11px] text-slate-400">PIN {item.pinCode}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SeverityBadge severity={item.severity} km={item.distanceKm} />
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">Stored in Sheet</p>
              <p className="text-[12px] font-mono text-slate-700">{item.storedLat.toFixed(5)}, {item.storedLng.toFixed(5)}</p>
              <p className="text-[11px] text-slate-500 mt-1">City label: <span className="font-semibold">{item.city || "—"}</span></p>
              <a
                href={storedMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                <ExternalLink className="h-3 w-3" /> View pin location
              </a>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-3">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">Expected (PIN {item.pinCode})</p>
              <p className="text-[12px] font-mono text-slate-700">{item.expectedLat.toFixed(5)}, {item.expectedLng.toFixed(5)}</p>
              <p className="text-[11px] text-slate-500 mt-1">Area for PIN <span className="font-semibold">{item.pinCode}</span></p>
              <a
                href={expectedMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                <ExternalLink className="h-3 w-3" /> View PIN area
              </a>
            </div>
          </div>

          <a
            href={compareUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-[12px] font-semibold transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Compare both locations in Google Maps
          </a>

          <div className={`rounded-xl p-3 text-[11px] ${item.severity === "high" ? "bg-red-50 border border-red-100 text-red-700" : "bg-amber-50 border border-amber-100 text-amber-700"}`}>
            <span className="font-bold">How to fix: </span>
            Open your Google Sheet → find <span className="font-mono font-bold">{item.companyName}</span> → update either the <span className="font-bold">Latitude/Longitude</span> columns to match PIN {item.pinCode}'s area, or correct the <span className="font-bold">PIN Code</span> to match the stored coordinates.
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataQualityPage() {
  const [result, setResult] = useState<QualityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "high" | "medium">("all");

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/data-quality");
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${resp.status}`);
      }
      const data = await resp.json() as QualityResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runCheck();
  }, []);

  const filtered = result
    ? filter === "all"
      ? result.items
      : result.items.filter((i) => i.severity === filter)
    : [];

  const highCount = result?.items.filter((i) => i.severity === "high").length ?? 0;
  const medCount = result?.items.filter((i) => i.severity === "medium").length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/">
            <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-[15px] font-bold text-slate-900">Data Quality Checker</h1>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest">Location accuracy audit</p>
          </div>
          <button
            onClick={runCheck}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Checking…" : "Re-check"}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Loading state */}
        {loading && !result && (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
            <RefreshCw className="h-8 w-8 text-indigo-400 animate-spin mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-slate-700">Geocoding PIN codes…</p>
            <p className="text-[12px] text-slate-400 mt-1">Verifying each client's coordinates against their PIN code area. This may take 10–30 seconds on first run.</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-red-700">Check failed</p>
              <p className="text-[12px] text-red-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Summary cards */}
        {result && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                <p className="text-[24px] font-black text-slate-900">{result.totalChecked}</p>
                <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mt-0.5">Clients Checked</p>
              </div>
              <div className={`rounded-2xl border p-4 text-center ${highCount > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
                <p className={`text-[24px] font-black ${highCount > 0 ? "text-red-600" : "text-slate-900"}`}>{highCount}</p>
                <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mt-0.5">High (≥15 km)</p>
              </div>
              <div className={`rounded-2xl border p-4 text-center ${medCount > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
                <p className={`text-[24px] font-black ${medCount > 0 ? "text-amber-600" : "text-slate-900"}`}>{medCount}</p>
                <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mt-0.5">Medium (5–15 km)</p>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 text-center">
              Checked at {new Date(result.checkedAt).toLocaleTimeString()} · PIN codes geocoded via Google Maps · flags if pin &gt; {result.thresholdKm} km from its PIN area center
            </div>

            {/* All-OK state */}
            {result.flaggedCount === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-8 flex flex-col items-center text-center gap-3">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <div>
                  <p className="text-[15px] font-bold text-green-800">All locations look correct!</p>
                  <p className="text-[12px] text-green-600 mt-1">All {result.totalChecked} clients' coordinates are within {result.thresholdKm} km of their PIN code area.</p>
                </div>
              </div>
            )}

            {/* Filters */}
            {result.flaggedCount > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                {(["all", "high", "medium"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors capitalize ${
                      filter === f
                        ? f === "high"
                          ? "bg-red-100 text-red-700 border border-red-200"
                          : f === "medium"
                          ? "bg-amber-100 text-amber-700 border border-amber-200"
                          : "bg-slate-800 text-white"
                        : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {f === "all" ? `All (${result.flaggedCount})` : f === "high" ? `High (${highCount})` : `Medium (${medCount})`}
                  </button>
                ))}
              </div>
            )}

            {/* Flagged list */}
            {filtered.length > 0 && (
              <div className="space-y-2">
                {filtered.map((item) => (
                  <ClientRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
