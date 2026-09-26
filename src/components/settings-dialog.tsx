"use client";

import { usePieceSet } from "./piece-set";
import { squareAppearance, WOODEN_COLORS, WOOD_GRAIN } from "@/lib/board-appearance";
import { Settings2 } from "lucide-react";
import { useSound } from "@/store/sound";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { defaultPreferences } from "@/lib/preferences";
import { useWorkspace } from "@/store/workspace";
import { ImportSettings } from "./import-settings";
import { EngineSettings } from "@/components/engine-settings";
const DataSettings = dynamic(() => import("@/components/data-settings").then((module) => module.DataSettings), { loading: () => <p role="status">Loading local data controls…</p> });

export function SettingsDialog() {
  const sound = useSound();
  const preferences = useWorkspace((state) => state.preferences);
  const previewPieces = usePieceSet(preferences.pieceSet);
  const update = useWorkspace((state) => state.updatePreferences);
  const storageError = useWorkspace((state) => state.storageError);
  const boardPresets = [
    { name: "Wooden", ...WOODEN_COLORS },
    { name: "Classic Green", lightSquare: "#EEEED2", darkSquare: "#769656" },
    { name: "Walnut", lightSquare: "#F0D9B5", darkSquare: "#B58863" },
    { name: "Ocean", lightSquare: "#DEE3E6", darkSquare: "#788A94" },
    { name: "Slate", lightSquare: "#E5E7EB", darkSquare: "#6B7280" },
    { name: "Forest", lightSquare: "#E6EAD7", darkSquare: "#4F6F52" },
    { name: "Mahogany", lightSquare: "#F2DFC8", darkSquare: "#8B5A46" },
    { name: "Maple", lightSquare: "#F7E7CE", darkSquare: "#C49562" },
    { name: "Sandstone", lightSquare: "#F4EBD0", darkSquare: "#B39B72" },
    { name: "Navy", lightSquare: "#E2E8F0", darkSquare: "#486581" },
    { name: "Teal", lightSquare: "#DEF0E9", darkSquare: "#4C8C82" },
    { name: "Lavender", lightSquare: "#EDE7F6", darkSquare: "#9381B0" },
    { name: "Charcoal", lightSquare: "#E8E8E8", darkSquare: "#555555" },
    { name: "Desert", lightSquare: "#F5DEB3", darkSquare: "#A9A978" },
    { name: "Rose", lightSquare: "#FFDAB9", darkSquare: "#FF6347" },
    { name: "Copper", lightSquare: "#DCB43C", darkSquare: "#8B4513" },
    { name: "Peach", lightSquare: "#FFEFD5", darkSquare: "#DC143C" },
  ] as const;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-card"><Settings2 size={16} /> Settings</Button>
      </DialogTrigger>
      <DialogContent className="settings-dialog">
        <DialogHeader className="settings-header">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Make this board your own. Changes apply immediately.</DialogDescription>
        </DialogHeader>
        <div className="settings-body">
        <section className="settings-panel settings-appearance" aria-labelledby="appearance-heading">
        <h3 id="appearance-heading" className="font-medium">Board & pieces</h3>
        <div className="settings-preview-row">
        <div className="space-y-3" aria-label="Board and pieces preview">
          <div className="grid grid-cols-6 overflow-hidden rounded-lg border">{["bK", "bQ", "bR", "bB", "bN", "bP", "wK", "wQ", "wR", "wB", "wN", "wP"].map((code, index) => { const Piece = previewPieces[code]; return <div key={code} className="aspect-square" style={squareAppearance(preferences, (index + Math.floor(index / 6)) % 2 === 0)}><Piece /></div>; })}</div>
          <p className="text-xs text-muted-foreground">Live preview · changes apply immediately.</p>
        </div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Pieces</legend><div className="flex gap-2">{(["classic", "carved"] as const).map(pieceSet => <Button key={pieceSet} variant="outline" aria-pressed={preferences.pieceSet === pieceSet} onClick={() => update({ pieceSet })}>{pieceSet === "classic" ? "Classic" : "Carved"}</Button>)}</div><p className="text-xs text-muted-foreground">Carved: original Chess Review SVG artwork, <a className="underline" href="/pieces/carved/LICENSE.txt" target="_blank" rel="noreferrer">MIT licensed</a>.</p></fieldset>
        </div>
        <div className="space-y-5 py-3">
          {([
            ["lightSquare", "Light squares"],
            ["darkSquare", "Dark squares"],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <label htmlFor={key} className="text-sm font-medium">{label}</label>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">{preferences[key].toUpperCase()}</span>
                <input id={key} type="color" value={preferences[key]} onChange={(event) => update({ [key]: event.target.value, boardTexture: "plain" })} className="h-10 w-12 cursor-pointer rounded-md border bg-transparent p-1" />
              </div>
            </div>
          ))}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Board colour presets</legend>

            <div className="settings-presets grid grid-cols-2 gap-2">
              {boardPresets.map(({ name, lightSquare, darkSquare }) => {
                const selected =
                  preferences.lightSquare.toLowerCase() === lightSquare.toLowerCase() &&
                  preferences.darkSquare.toLowerCase() === darkSquare.toLowerCase() && preferences.boardTexture === (name === "Wooden" ? "wooden" : "plain");

                return (
                  <Button
                    key={name}
                    type="button"
                    variant="outline"
                    aria-pressed={selected}
                    onClick={() => update({ lightSquare, darkSquare, boardTexture: name === "Wooden" ? "wooden" : "plain" })}
                    className={`h-auto justify-start gap-2 whitespace-normal p-2 ${
                      selected ? "border-primary ring-1 ring-primary" : ""
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="grid h-8 w-8 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded border"
                    >
                      {[lightSquare, darkSquare, darkSquare, lightSquare].map(
                        (color, index) => (
                          <span key={index} style={{ backgroundColor: color, ...(name === "Wooden" ? { backgroundImage: WOOD_GRAIN } : {}) }} />
                        )
                      )}
                    </span>

                    <span className="text-left text-sm">{name}</span>
                  </Button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex items-center justify-between gap-4 border-t pt-5">
            <div>
              <label htmlFor="coordinates" className="text-sm font-medium">Show coordinates</label>
              <p className="mt-1 text-sm text-muted-foreground">Files a–h and ranks 1–8</p>
            </div>
            <Switch id="coordinates" checked={preferences.showCoordinates} onCheckedChange={(showCoordinates) => update({ showCoordinates })} />
          </div>
        </div>
        </section>
        <section className="settings-panel space-y-5" aria-label="Analysis and sound">
        <EngineSettings />
        <section className="space-y-2 border-t pt-4" aria-label="Sound settings">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="sound-effects" className="text-sm font-medium">Sound effects</label>
            <Switch id="sound-effects" checked={sound.enabled} onCheckedChange={sound.update} />
          </div>
          <p className="text-xs text-muted-foreground">Moves, captures, promotion, check, checkmate, castling, invalid moves, buttons and completed game reviews.</p>
          {sound.error && <p role="alert" className="text-sm text-destructive">{sound.error}</p>}
        </section>
        </section>
        <div className="settings-panel settings-data space-y-5">
        <ImportSettings />
        <DataSettings />
        </div>
        </div>
        <div className="settings-footer flex flex-wrap items-center justify-between gap-3 border-t">
          <p className="text-sm text-muted-foreground">Saved on this device</p>
          <Button variant="secondary" onClick={() => update(defaultPreferences)}>Restore defaults</Button>
        {storageError && <p role="alert" className="text-sm text-destructive">{storageError}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
