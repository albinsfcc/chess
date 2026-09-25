import Image from "next/image";
import type { MoveLabel } from "@/lib/game-analysis/move-quality";

/** Standalone, self-hosted SVG paths; no fonts, emoji rendering or remote assets. */
export function MoveStrengthIcon({ label, className = "size-5" }: { label: MoveLabel; className?: string }) {
  return <Image src={`/icons/moves/${label.toLowerCase().replaceAll(" ", "-")}.svg`} width={32} height={32} alt="" aria-hidden="true" draggable={false} unoptimized className={className} />;
}
