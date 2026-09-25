"use client";
import type { ReactNode } from "react";
import { Tabs } from "radix-ui";
import { BookOpen, Cpu, Library, ListOrdered } from "lucide-react";
export type InspectorSection = "moves" | "engine" | "opening" | "library";
const sections = [
  { id: "moves", label: "Moves", icon: ListOrdered },
  { id: "engine", label: "Engine", icon: Cpu },
  { id: "opening", label: "Opening", icon: BookOpen },
  { id: "library", label: "Library", icon: Library },
] as const;
export function WorkspaceInspector({ value, onChange, panels, actions }: {
  value: InspectorSection; onChange: (section: InspectorSection) => void;
  panels: Record<InspectorSection, ReactNode>; actions: ReactNode;
}) {
  return <Tabs.Root value={value} onValueChange={value => onChange(value as InspectorSection)} className="frost-inspector">
    <div className="inspector-chrome">
    <div className="inspector-heading"><div><p className="eyebrow">Your workspace</p><h2 className="text-lg font-semibold tracking-tight">Explore the position</h2></div>{actions}</div>
    <Tabs.List aria-label="Workspace sections" className="inspector-tabs">
      {sections.map(({ id, label, icon: Icon }) => <Tabs.Trigger key={id} value={id} className="inspector-tab"><Icon size={15} aria-hidden="true" /><span>{label}</span></Tabs.Trigger>)}
    </Tabs.List>
    </div>
    {sections.map(({ id }) => <Tabs.Content key={id} value={id} forceMount className="inspector-content data-[state=inactive]:hidden">{panels[id]}</Tabs.Content>)}
  </Tabs.Root>;
}
