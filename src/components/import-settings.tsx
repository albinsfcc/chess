"use client";
import { GlassSelect } from "./ui/glass-select";
import { useEffect } from "react";
import { useImportPreferences } from "@/store/import-preferences";
export function ImportSettings() {
 const preferences = useImportPreferences(), hydrate = preferences.hydrate; useEffect(() => hydrate(), [hydrate]);
 return <section className="space-y-3 border-t pt-4" aria-label="Import settings"><h3 className="font-medium">Import settings</h3><div className="grid grid-cols-2 gap-3">{([['initialCount','Recent games'],['moreCount','Load more games']] as const).map(([key,label])=><label key={key} className="text-sm">{label}<GlassSelect aria-label={label} className="mt-2 h-10 w-full rounded border bg-background px-2" value={preferences[key]} onValueChange={(value)=>preferences.update({[key]:Number(value)})}>{Array.from({length:50},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</GlassSelect></label>)}</div><p className="text-xs text-muted-foreground">Initial games and additional games per batch, for both platforms. Up to 1,000 recent games per discovery; use filters for older games.</p>{preferences.error&&<p role="alert">{preferences.error}</p>}</section>;
}
