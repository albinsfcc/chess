"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { useDataManagement } from "@/store/data-management";

export function DataSettings() {
  const data = useDataManagement();
  const [confirm, setConfirm] = useState<"all" | "analysis" | null>(null);
  return <section className="space-y-3 border-t pt-4" aria-label="Local data management">
    <h3 className="font-medium">Local data & backups</h3>
    <p className="text-sm text-muted-foreground">Games stay in this browser. Back up before clearing browser data or moving devices. Backups include public usernames and game history.</p>
    <Button variant="outline" disabled={data.busy} onClick={() => void data.export()}>Export local backup</Button>
    <label className="block text-sm">Import local backup<input aria-label="Import local backup" className="mt-2 block w-full min-w-0 rounded border p-2 text-xs" type="file" accept=".json,application/json" disabled={data.busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void data.validate(file); event.target.value = ""; }} /></label>
    {data.preview && <div className="space-y-2 rounded-md border p-3 text-sm" aria-label="Backup preview"><p>{data.preview.documents.length} games · {data.preview.profiles.length} profiles · {data.preview.sessions.length} analysis sessions</p><p>Format version {data.preview.version}. Existing records are preserved; saved preferences will be restored.</p><Button disabled={data.busy} onClick={() => void data.restore()}>Restore validated backup</Button></div>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={data.busy} onClick={() => setConfirm("analysis")}>Clear analysis results</Button><Button variant="destructive" disabled={data.busy} onClick={() => setConfirm("all")}>Clear all local data</Button></div>
    {data.busy && <p role="status" className="text-sm">Working with local data…</p>}
    {data.success && <p role="status" className="break-words text-sm text-primary">{data.success}</p>}
    {data.error && <p role="alert" className="break-words text-sm text-destructive">{data.error}</p>}
    <Dialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null); }}><DialogContent><DialogHeader><DialogTitle>{confirm === "all" ? "Clear all local data?" : "Clear analysis results?"}</DialogTitle><DialogDescription>{confirm === "all" ? "This permanently removes saved games, profiles, analysis and preferences from this browser. Export a backup first." : "This removes cached evaluations and analysis sessions. Games, PGNs and profiles are kept."} Close other Chess Review tabs first. Active game analysis will be paused.</DialogDescription></DialogHeader><div className="flex flex-wrap gap-2"><Button variant="outline" autoFocus onClick={() => setConfirm(null)}>Keep local data</Button><Button variant="destructive" onClick={() => { const all = confirm === "all"; setConfirm(null); void data.clear(all); }}>Confirm {confirm === "all" ? "clear all data" : "clear analysis"}</Button></div></DialogContent></Dialog>
  </section>;
}
