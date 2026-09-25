"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { commitImport, previewImport } from "@/lib/pgn/import-service";
import { storageErrorMessage } from "@/lib/db/games";
import type { ImportResult } from "@/lib/pgn/domain";
import { reviewImportedGame } from "@/store/import-review";
import { useLibrary } from "@/store/library";
import { byteLength, PGN_LIMITS } from "@/lib/pgn/limits";

export function PgnImportDialog() {
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const validation = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<"validate" | "import" | "paste" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const refresh = useLibrary((state) => state.refresh);
  const importable = result ? result.validGames.length + result.unsupportedGames.length : 0;

  function changeInput(value: string) { validation.current?.abort(); validation.current = null; setBusy(null); setInput(value); setResult(null); setSuccess(null); setError(null); }
  async function paste() {
    setBusy("paste"); setError(null);
    try { const text = await navigator.clipboard.readText(); if (text.length > PGN_LIMITS.pasteBytes || byteLength(text) > PGN_LIMITS.pasteBytes) { setError("Paste exceeds 5 MB. Split it into smaller batches."); return; } changeInput(text); }
    catch { setError("Clipboard access is unavailable. Paste directly into the PGN field using your keyboard or device paste menu."); }
    finally { setBusy(null); }
  }
  const validate = useCallback(async () => {
    clearTimeout(debounce.current); validation.current?.abort();
    if (!input.trim()) { setResult(null); setBusy(null); return; }
    const controller = new AbortController(); validation.current = controller;
    setBusy("validate"); setError(null); setSuccess(null); setResult(null);
    try { const preview = await previewImport(input, undefined, controller.signal); if (!controller.signal.aborted && validation.current === controller) setResult(preview); }
    catch (error) { if (!controller.signal.aborted && validation.current === controller) setError(storageErrorMessage(error)); }
    finally { if (validation.current === controller) setBusy(null); }
  }, [input]);
  useEffect(() => {
    if (open && input.trim()) debounce.current = setTimeout(() => void validate(), 350);
    return () => { clearTimeout(debounce.current); validation.current?.abort(); };
  }, [open, input, validate]);
  async function save() {
    if (!result || !importable) return;
    setBusy("import"); setError(null);
    try {
      const saved = await commitImport(result);
      setSuccess(`Imported ${saved.imported} ${saved.imported === 1 ? "game" : "games"}. ${result.duplicateGames.length + saved.duplicates} duplicates skipped. Open a game from your library.`);
      setResult(null);
      await refresh();
      const imported = [...result.validGames, ...result.unsupportedGames];
      if (imported.length === 1 && imported[0].tree.playable) await reviewImportedGame(imported[0]);
      setOpen(false);
    } catch (error) { setError(storageErrorMessage(error)); }
    finally { setBusy(null); }
  }

  return <Dialog open={open} onOpenChange={(value) => { if (busy === "import") return; if (!value) { clearTimeout(debounce.current); validation.current?.abort(); validation.current = null; setBusy(null); } setOpen(value); }}>
    <DialogTrigger asChild><Button variant="outline"><ClipboardPaste /> Paste PGN</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Import PGN</DialogTitle><DialogDescription>Paste a game or collection. Validation runs automatically. A single standard game opens directly in review after import.</DialogDescription></DialogHeader>
      <div className="flex items-center justify-between gap-3"><label htmlFor="pgn-input" className="text-sm font-medium">PGN games</label><Button variant="secondary" size="sm" disabled={!!busy} onClick={paste}><ClipboardPaste /> {busy === "paste" ? "Pasting…" : "Paste"}</Button></div>
      <p className="text-xs text-muted-foreground">Up to 5 MB, 100 games, 500 KB per game, 32 variation levels and 20,000 total moves.</p>
      <textarea id="pgn-input" value={input} disabled={busy === "import" || busy === "paste"} maxLength={PGN_LIMITS.pasteBytes + 1} onChange={(event) => changeInput(event.target.value)} onBlur={() => { if (!result && busy !== "import" && busy !== "paste") void validate(); }} spellCheck={false}
        placeholder={'[White "White player"]\n[Black "Black player"]\n\n1. e4 e5 2. Nf3 Nc6 *'}
        className="min-h-56 w-full resize-y rounded-md border bg-background p-3 font-mono text-sm leading-relaxed disabled:opacity-60" />
      {busy && <p role="status" className="text-sm text-muted-foreground">{busy === "validate" ? "Parsing games and checking moves…" : busy === "import" ? "Saving games locally…" : "Reading clipboard…"}</p>}
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      {success && <p role="status" className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{success}</p>}
      {result && <div className="space-y-3" aria-label="Import preview">
        <div role="status" className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-3 text-sm sm:grid-cols-4">
          <span>{result.validGames.length} valid games</span><span>{result.duplicateGames.length} duplicates</span>
          <span>{result.unsupportedGames.length} unsupported variants</span><span>{result.invalidEntries.length} invalid games</span>
        </div>
        {result.unsupportedGames.length > 0 && <p className="text-sm text-amber-200">Unsupported variants will be saved for reference. They cannot be opened on the standard chessboard.</p>}
        {result.validGames.concat(result.unsupportedGames).map(({ game, entryIndex }) => <p key={game.id} className="break-words text-sm text-muted-foreground">Game {entryIndex}: {game.white} vs {game.black} · {game.result}{game.analysisStatus === "unsupported" ? ` · ${game.variant} (unsupported)` : ""}</p>)}
        {result.invalidEntries.map((entry) => <details key={entry.entryIndex} className="rounded-md border border-destructive/40 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-destructive">Game {entry.entryIndex}: invalid{entry.line ? ` · line ${entry.line}${entry.column ? `, column ${entry.column}` : ""}` : ""}</summary>
          <p className="my-3 break-words">{entry.message}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-xs">{entry.rawPgn}</pre>
        </details>)}
        {!!result.invalidEntries.length && !!importable && <p className="text-sm text-muted-foreground">Only valid and unsupported games will be saved. Invalid entries stay here for correction.</p>}
      </div>}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {busy === "validate" && <Button variant="outline" onClick={() => validation.current?.abort()}>Cancel validation</Button>}
        <Button variant="ghost" disabled={busy === "import"} onClick={() => { validation.current?.abort(); validation.current = null; clearTimeout(debounce.current); setBusy(null); setOpen(false); }}>{success ? "Close" : "Cancel"}</Button>
        <Button disabled={!!busy || !importable} onClick={save}>Import{importable ? ` ${importable} ${importable === 1 ? "game" : "games"}` : ""}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
