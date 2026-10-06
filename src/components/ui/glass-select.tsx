"use client";

import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Select } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

// Accept option children so long lists and their labels have one source of truth.
function options(children: ReactNode): { value: string; label: ReactNode; disabled?: boolean }[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>(child)) return [];
    if (child.type === Fragment) return options(child.props.children);
    return [{ value: String(child.props.value ?? child.props.children ?? ""), label: child.props.children, disabled: child.props.disabled }];
  });
}

export function GlassSelect({ value, onValueChange, children, className, disabled, "aria-label": label }: {
  value: string | number; onValueChange: (value: string) => void; children: ReactNode;
  className?: string; disabled?: boolean; "aria-label": string;
}) {
  const items = options(children);
  return <Select.Root value={`value:${value}`} onValueChange={next => onValueChange(next.slice(6))} disabled={disabled}>
    <Select.Trigger aria-label={label} className={`glass-select-trigger ${className ?? ""}`}>
      <Select.Value /><Select.Icon><ChevronDown size={16} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content position="popper" sideOffset={6} collisionPadding={12} className="glass-select-menu">
      <Select.ScrollUpButton className="glass-select-scroll"><ChevronUp size={16} /></Select.ScrollUpButton>
      <Select.Viewport>{items.map(item => <Select.Item key={item.value} value={`value:${item.value}`} disabled={item.disabled} className="glass-select-option">
        <Select.ItemText>{item.label}</Select.ItemText><Select.ItemIndicator><Check size={16} /></Select.ItemIndicator>
      </Select.Item>)}</Select.Viewport>
      <Select.ScrollDownButton className="glass-select-scroll"><ChevronDown size={16} /></Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
