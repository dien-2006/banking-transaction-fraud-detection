import type { CSSProperties } from "react";

// Reuse only illustration regions from the supplied design, not its UI or text.
// Percentage offsets keep each region proportional at every viewport size.
const regions = {
  hero: { x: 790, y: 83, width: 725, height: 180 },
  phone: { x: 25, y: 609, width: 211, height: 190 },
  gift: { x: 1228, y: 677, width: 99, height: 87 },
};

export function ReferenceArtwork({ region, className = "" }: { region: keyof typeof regions; className?: string }) {
  const { x, y, width, height } = regions[region];
  const style: CSSProperties = {
    aspectRatio: `${width} / ${height}`,
    position: "relative", overflow: "hidden", flexShrink: 0,
  };
  return <div aria-hidden="true" className={`customer-artwork ${className}`} style={style}>
    <img src="/customer-home-reference.png" alt="" draggable={false} style={{
      position: "absolute", maxWidth: "none", width: `${1536 / width * 100}%`,
      left: `${-x / width * 100}%`, top: `${-y / height * 100}%`, height: "auto",
    }}/>
  </div>;
}
