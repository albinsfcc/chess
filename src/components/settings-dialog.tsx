"use client";

import { Settings2 } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { defaultPreferences } from "@/lib/preferences";
import { useWorkspace } from "@/store/workspace";
import { EngineSettings } from "@/components/engine-settings";
const DataSettings = dynamic(() => import("@/components/data-settings").then((module) => module.DataSettings), { loading: () => <p role="status">Loading local data controls…</p> });

export function SettingsDialog() {
  const preferences = useWorkspace((state) => state.preferences);
  const update = useWorkspace((state) => state.updatePreferences);
  const storageError = useWorkspace((state) => state.storageError);
  const boardPresets = [
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md" style={{ scrollbarWidth: 'none', scrollbarColor: 'transparent transparent' }}>
        <DialogHeader>
          <DialogTitle>Board settings</DialogTitle>
          <DialogDescription>Make this board your own. Changes apply immediately.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-3">
          {([
            ["lightSquare", "Light squares"],
            ["darkSquare", "Dark squares"],
          ] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <label htmlFor={key} className="text-sm font-medium">{label}</label>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">{preferences[key].toUpperCase()}</span>
                <input id={key} type="color" value={preferences[key]} onChange={(event) => update({ [key]: event.target.value })} className="h-10 w-12 cursor-pointer rounded-md border bg-transparent p-1" />
              </div>
            </div>
          ))}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Board colour presets</legend>

            <div className="grid grid-cols-2 gap-3">
              {boardPresets.map(({ name, lightSquare, darkSquare }) => {
                const selected =
                  preferences.lightSquare.toLowerCase() === lightSquare.toLowerCase() &&
                  preferences.darkSquare.toLowerCase() === darkSquare.toLowerCase();

                return (
                  <Button
                    key={name}
                    type="button"
                    variant="outline"
                    aria-pressed={selected}
                    onClick={() => update({ lightSquare, darkSquare })}
                    className={`h-auto justify-start gap-3 whitespace-normal p-3 ${
                      selected ? "border-primary ring-1 ring-primary" : ""
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="grid h-10 w-10 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded border"
                    >
                      {[lightSquare, darkSquare, darkSquare, lightSquare].map(
                        (color, index) => (
                          <span key={index} style={{ backgroundColor: color }} />
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
        <EngineSettings />
        <DataSettings />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">Saved on this device</p>
          <Button variant="secondary" onClick={() => update(defaultPreferences)}>Restore defaults</Button>
        </div>
        {storageError && <p role="alert" className="text-sm text-destructive">{storageError}</p>}
      </DialogContent>
    </Dialog>
  );
}
