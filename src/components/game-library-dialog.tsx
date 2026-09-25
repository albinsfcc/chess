"use client";
import { useState } from "react";
import { Library } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { GameLibrary } from "./game-library";
export function GameLibraryDialog() {
 const [open,setOpen]=useState(false);
 return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline"><Library /> Game library</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Saved games</DialogTitle><DialogDescription>Open or manage games saved on this device. Choose Review game after opening a game.</DialogDescription></DialogHeader><GameLibrary onOpen={()=>setOpen(false)} /></DialogContent></Dialog>;
}
