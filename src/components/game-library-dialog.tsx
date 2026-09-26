"use client";
import { useEffect, useState } from "react";
import { Library } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { GameLibrary } from "./game-library";
import { useLibrary } from "@/store/library";
export function GameLibraryDialog({ disabled = false, onOpen }: { disabled?: boolean; onOpen?: () => void }) {
 const [open,setOpen]=useState(false);
 const total = useLibrary(state => state.total), status = useLibrary(state => state.status);
 useEffect(() => {
   const refresh = () => { void useLibrary.getState().refresh(); };
   refresh(); window.addEventListener("focus", refresh);
   return () => window.removeEventListener("focus", refresh);
 }, []);
 const empty = total === 0 && status !== "error";
 return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline" aria-label="Game library" disabled={disabled || empty} title={disabled ? "Finish or exit the computer game to open your library" : empty ? "No saved games yet" : "Open saved games"}><Library /> Game library <span data-testid="library-count" className="rounded-full bg-primary/10 px-2 py-0.5 text-xs tabular-nums">{total}</span></Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Saved games</DialogTitle><DialogDescription>Open or manage games saved on this device. Choose Review game after opening a game.</DialogDescription></DialogHeader><GameLibrary onOpen={()=>{ setOpen(false); onOpen?.(); }} /></DialogContent></Dialog>;
}
