"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { platformName, type Platform } from "@/lib/platforms/domain";
import { defaultFilters, filterGames, type DiscoveryFilters } from "@/lib/platforms/import-service";
import { useImportPreferences } from "@/store/import-preferences";
import { reviewImportedGame } from "@/store/import-review";
import { platformStores } from "@/store/platform-import";

const fieldClass = "h-9 min-w-0 w-full rounded-md border border-input bg-background px-2 text-sm";
const PAGE_SIZE = 25;
const LARGE_IMPORT = 100;

export function PlatformImportDialog({ platform }: { platform: Platform }) {
  const action = useRef(0), preferences = useImportPreferences();
  const useImport = platformStores[platform];
  const state = useImport();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [fromMonth, setFromMonth] = useState<string | null>(null);
  const [toMonth, setToMonth] = useState<string | null>(null);
  const [since, setSince] = useState(""); const [until, setUntil] = useState("");
  const [max, setMax] = useState(100); const [full, setFull] = useState(false);
  const [filters, setFilters] = useState<DiscoveryFilters>(defaultFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [confirmImport, setConfirmImport] = useState<string[] | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const matching = useMemo(() => filterGames(state.rows, filters), [state.rows, filters]);
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = matching.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const actualSelected = state.rows.filter((row) => selected.has(row.key) && !row.alreadyImported).map((row) => row.key);
  const available = matching.filter((row) => !row.alreadyImported).map((row) => row.key);
  const busy = !!state.busy;
  const oldest = fromMonth ?? (full ? "" : state.profile?.discoveryCheckpoint?.slice(0, 7) ?? state.months.at(-1) ?? "");
  const newest = toMonth ?? state.months.at(-1) ?? "";
  const invalidRange = (filters.since && filters.until && filters.since > filters.until) || (since && until && since > until) || (oldest && newest && oldest > newest) || max < 1 || max > 1000 || !Number.isInteger(max);

  function changeFilter(key: keyof DiscoveryFilters, value: string) { setFilters((current) => ({ ...current, [key]: value })); setPage(0); }
  async function performImport(keys: string[]) {
    const token = ++action.current;
    await useImport.getState().importRows(keys);
    if (token !== action.current) return;
    const current = useImport.getState(), rows = current.rows.filter((row) => keys.includes(row.key));
    if (current.error || rows.length !== keys.length || rows.some((row) => !row.alreadyImported)) return;
    try {
      if (rows.length === 1 && rows[0].document.tree.playable) await reviewImportedGame(rows[0].document, () => token === action.current);
      if (token !== action.current) return;
      setOpen(false); setSelected(new Set());
    } catch (error) { useImport.setState({error: error instanceof Error ? error.message : "Unable to open the saved game."}); }
  }
  function requestImport(keys: string[]) {
    if (keys.length > LARGE_IMPORT) setConfirmImport(keys);
    else void performImport(keys);
  }
  function discover() {
    setSelected(new Set()); setPage(0);
    const from = since || filters.since, through = until || filters.until;
    void state.discover({ full: full || !!from || !!through, max, fromMonth: from ? from.slice(0, 7) : oldest || undefined, toMonth: through ? through.slice(0, 7) : toMonth || undefined,
      since: from ? Date.parse(`${from}T00:00:00Z`) : undefined, until: through ? Date.parse(`${through}T23:59:59.999Z`) : undefined });
  }
  return <Dialog open={open} onOpenChange={(value) => {
    if (!value) { action.current++; state.cancel(); }
    setOpen(value);
    if (value) { setSelected(new Set()); setFromMonth(null); setToMonth(null); setFull(false); setFilters(defaultFilters); setPage(0); void state.initialize(); }
  }}>
    <DialogTrigger asChild><Button variant="outline"><ArrowDownToLine /> Import from {platformName[platform]}</Button></DialogTrigger>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader><DialogTitle>{platformName[platform]} public games</DialogTitle><DialogDescription>Use a public username only. Profiles and imported games are saved on this device.</DialogDescription></DialogHeader>
      {state.loading ? <p role="status" className="text-sm text-muted-foreground">Loading saved profile…</p> : state.editing ? <div className="space-y-4">
        <div><label htmlFor={`${platform}-username`} className="mb-2 block text-sm font-medium">{platformName[platform]} username</label>
          <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void state.lookup(username); }}>
            <input id={`${platform}-username`} className={`${fieldClass} flex-1`} placeholder="Username" value={username} autoComplete="off" spellCheck={false} disabled={busy}
              onChange={(event) => { setUsername(event.target.value); useImport.setState({ candidate: null, error: null }); }} />
            <Button type="submit" disabled={busy || !username.trim()}>Validate profile</Button>
          </form>
        </div>
        {state.candidate && <div className="rounded-lg border bg-secondary p-4" aria-label="Validated profile">
          <p className="font-medium">{state.candidate.displayName ?? state.candidate.username}</p><p className="mt-1 text-sm text-muted-foreground">@{state.candidate.username} · {platformName[state.candidate.platform]}</p>
          <Button className="mt-3" disabled={busy} onClick={() => { setFromMonth(null); setToMonth(null); setSelected(new Set()); void state.saveProfile(); }}>Save profile</Button>
        </div>}
        {state.profile && <Button variant="ghost" disabled={busy} onClick={state.back}>Keep current profile</Button>}
      </div> : state.profile && <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-secondary/40 p-3">
          <div><p className="font-medium">@{state.profile.username}</p><p className="mt-1 text-xs text-muted-foreground">Last sync: {state.profile.lastSyncedAt ? new Date(state.profile.lastSyncedAt).toLocaleString() : "Never"}</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={() => { setUsername(state.profile?.username ?? ""); state.edit(); }}>Change Profile</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove Profile</Button></div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Recent games</h3><Button disabled={busy} onClick={() => { setFilters(defaultFilters); setSelected(new Set()); setPage(0); void state.discover({ recent: true, full: true, max: preferences.initialCount }); }}>Refresh Games</Button></div>
        <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">More games / Filters</summary>
        <fieldset disabled={busy} className="mt-3 space-y-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Discovery range</legend>
          {platform === "chesscom" ? <>
            <p className="text-xs text-muted-foreground">{state.months.length ? `Available archives: ${state.months[0]} through ${state.months.at(-1)}. Months are fetched one at a time.` : "No archive months loaded. Refresh Games to check again."}</p>
            <div className="grid grid-cols-2 gap-3">{([["From month", oldest, setFromMonth], ["To month", newest, setToMonth]] as const).map(([label, value, update]) => <label key={label} className="text-sm">{label}<select aria-label={label} className={`${fieldClass} mt-1`} value={value} onChange={(event) => update(event.target.value)}><option value="">All available</option>{[...new Set([...state.months, value].filter(Boolean))].sort().map((month) => <option key={month}>{month}</option>)}</select></label>)}</div>
          </> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-sm">Since<input aria-label="Discover since" className={`${fieldClass} mt-1`} type="date" min="2013-01-02" value={since} onChange={(event) => setSince(event.target.value)} /></label>
            <label className="text-sm">Until<input aria-label="Discover until" className={`${fieldClass} mt-1`} type="date" min="2013-01-02" value={until} onChange={(event) => setUntil(event.target.value)} /></label>
            <label className="text-sm">Maximum games<input aria-label="Maximum games" className={`${fieldClass} mt-1`} type="number" min={1} max={1000} value={max} onChange={(event) => setMax(Number(event.target.value))} /></label>
          </div>}
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={full} onCheckedChange={(value) => { setFull(value === true); setFromMonth(null); }} /> Full refresh (include older games in this range)</label>
          <p className="text-xs text-muted-foreground">Normal refresh revisits recent games and deduplicates. Use full refresh to revisit older dates.</p>
          {invalidRange && <p role="alert" className="text-sm text-destructive">Choose an ordered date range and a maximum between 1 and 1,000.</p>}
          <Button disabled={busy || !!invalidRange} onClick={discover}>Fetch matching games</Button>
        </fieldset>

        <fieldset className="grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-3" aria-label="Discovery filters">
          <legend className="px-1 text-sm font-medium">Filter discovered games</legend>
          <label className="text-sm">From date<input type="date" aria-label="Filter from date" className={`${fieldClass} mt-1`} value={filters.since} onChange={(event) => changeFilter("since", event.target.value)} /></label>
          <label className="text-sm">To date<input type="date" aria-label="Filter to date" className={`${fieldClass} mt-1`} value={filters.until} onChange={(event) => changeFilter("until", event.target.value)} /></label>
          {([
            ["result", "Result", [["all", "All results"], ["1-0", "White wins"], ["0-1", "Black wins"], ["1/2-1/2", "Draw"], ["*", "Unfinished"]]],
            ["timeCategory", "Time category", [["all", "All categories"], ...[...new Set(state.rows.map((row) => row.document.game.timeCategory ?? "unknown"))].map((value) => [value, value])]],
            ["rated", "Rated/casual", [["all", "All games"], ["rated", "Rated"], ["casual", "Casual"]]],
            ["imported", "Import status", [["all", "All statuses"], ["new", "Not imported"], ["imported", "Already imported"]]],
          ] as const).map(([key, label, options]) => <label key={key} className="text-sm">{label}<select aria-label={label} className={`${fieldClass} mt-1`} value={filters[key]} onChange={(event) => changeFilter(key, event.target.value)}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
        </fieldset>
        </details>
        {state.busy === "fetch" && <div role="status" aria-label="Loading recent games" className="space-y-2"><span className="sr-only">Loading games</span>{Array.from({ length: preferences.initialCount }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm" aria-live="polite">{matching.length} matching · {actualSelected.length} selected · {state.rows.length} discovered</p>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => setSelected((previous) => new Set([...previous, ...visible.filter((row) => !row.alreadyImported).map((row) => row.key)]))}>Select visible</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button></div>
        </div>
        {!matching.length && !busy && <p className="py-4 text-sm text-muted-foreground">{state.rows.length ? "No games match these filters." : "No public games found. Retry Refresh Games or open More games to choose a range."}</p>}
        <ul className="max-h-[380px] space-y-2 overflow-y-auto" aria-label="Discovered games">
          {visible.map((row) => { const game = row.document.game; return <li key={row.key} className="flex gap-3 rounded-lg border p-3">
            <Checkbox aria-label={`Select ${game.white} vs ${game.black}`} checked={selected.has(row.key) && !row.alreadyImported} disabled={busy || row.alreadyImported} onCheckedChange={(checked) => setSelected((old) => { const next = new Set(old); if (checked) next.add(row.key); else next.delete(row.key); return next; })} />
            <div className="min-w-0 flex-1"><button type="button" disabled={busy || !row.document.tree.playable} aria-label={`Import and review ${game.white} vs ${game.black}`} className="break-words text-left text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50" onClick={() => requestImport([row.key])}>{game.white}{game.whiteRating !== null ? ` (${game.whiteRating})` : ""} vs {game.black}{game.blackRating !== null ? ` (${game.blackRating})` : ""}</button>
              <p className="mt-1 break-words text-xs text-muted-foreground">{game.result} · {game.playedAt?.slice(0, 10) ?? "Date unknown"} · {game.timeControl} · {game.timeCategory} · {game.rated === undefined ? "Rating mode unknown" : game.rated ? "Rated" : "Casual"} · {platformName[game.source]} · {game.variant}</p>
              {game.analysisStatus === "unsupported" && <p className="mt-1 text-xs text-amber-200">Unsupported variant — can be saved but cannot open on the standard board.</p>}
              {row.alreadyImported && <p className="mt-1 text-xs text-primary">Already imported</p>}
              {game.externalUrl && <a href={game.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary underline">Public game</a>}
            </div>
          </li>; })}
        </ul>
        {state.recentMode && <Button variant="outline" className="w-full" disabled={busy || !state.hasMore} onClick={() => void state.loadMore()}>{state.hasMore ? `Load ${preferences.moreCount} more games` : "No more recent games"}</Button>}
        {pages > 1 && <div className="flex items-center justify-center gap-3"><Button variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous page</Button><span className="text-sm">Page {currentPage + 1} of {pages}</span><Button variant="ghost" size="sm" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Next page</Button></div>}
        <div className="flex flex-wrap justify-end gap-2 border-t pt-3"><Button disabled={busy || !actualSelected.length} onClick={() => requestImport(actualSelected)}>Import selected</Button><Button variant="outline" disabled={busy || !available.length} onClick={() => requestImport(available)}>Import all matching ({available.length})</Button></div>
      </div>}
      {busy && <div className="flex items-center justify-between gap-2"><p role="status" className="text-sm text-muted-foreground">{state.busy === "lookup" ? "Validating public profile…" : state.progress || "Working…"}</p><Button variant="outline" size="sm" onClick={state.cancel}>{state.busy === "import" ? "Cancel import" : "Cancel active fetch"}</Button></div>}
      {!busy && state.progress && <p role="status" className="text-sm text-muted-foreground">{state.progress}</p>}
      {state.error && <p role="alert" className="break-words text-sm text-destructive">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-primary">{state.success}</p>}
      {!!state.warnings.length && <details className="rounded-md border border-amber-200/30 p-3 text-sm"><summary className="cursor-pointer text-amber-200">{state.warnings.length} discovery/import notices</summary><ul className="mt-2 max-h-48 space-y-2 overflow-y-auto break-words">{state.warnings.map((message, index) => <li key={index}>{message}</li>)}</ul></details>}
      <Dialog open={!!confirmImport} onOpenChange={(value) => { if (!value) setConfirmImport(null); }}><DialogContent><DialogHeader><DialogTitle>Import {confirmImport?.length} games?</DialogTitle><DialogDescription>This large import may take a while and uses storage on this device. Completed games are kept if you cancel.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmImport(null)}>Cancel</Button><Button onClick={() => { const keys = confirmImport; setConfirmImport(null); if (keys) void performImport(keys); }}>Confirm large import</Button></div></DialogContent></Dialog>
      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}><DialogContent><DialogHeader><DialogTitle>Remove saved profile?</DialogTitle><DialogDescription>Your imported games will remain in the local library.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setConfirmRemove(false)}>Cancel</Button><Button variant="destructive" onClick={() => { setConfirmRemove(false); void state.removeProfile(); }}>Remove saved profile</Button></div></DialogContent></Dialog>
    </DialogContent>
  </Dialog>;
}
