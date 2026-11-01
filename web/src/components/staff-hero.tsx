import type { CSSProperties } from "react";
import "./staff-hero.css";

const artwork = {
  cards: {
    src: "/cards-admin-reference.png",
    x: 1130,
    y: 76,
    width: 387,
    height: 182,
    sourceWidth: 1536,
    sourceHeight: 1024,
  },
  insights: {
    src: "/insights-admin-reference.png",
    x: 1150,
    y: 75,
    width: 367,
    height: 177,
    sourceWidth: 1536,
    sourceHeight: 1024,
  },
  audit: {
    src: "/audit-hero-v2.png",
    x: 1500,
    y: 134,
    width: 670,
    height: 458,
    sourceWidth: 2170,
    sourceHeight: 725,
  },
};

/** Keep headings as selectable text; crop only the decorative illustration. */
export function StaffHero({
  kind,
  eyebrow,
  title,
  accent,
  description,
}: {
  kind: keyof typeof artwork;
  eyebrow: string;
  title: string;
  accent: string;
  description: string;
}) {
  const region = artwork[kind];
  const style: CSSProperties = {
    width: `${(region.sourceWidth / region.width) * 100}%`,
    height: `${(region.sourceHeight / region.height) * 100}%`,
    left: `${(-region.x / region.width) * 100}%`,
    top: `${(-region.y / region.height) * 100}%`,
  };
  return (
    <section className={`staff-hero ${kind}-hero`}>
      <div className="staff-hero-copy">
        <small>{eyebrow}</small>
        <h1>
          {title} <span>{accent}</span>
        </h1>
        <p>{description}</p>
      </div>
      <div className="staff-hero-art" aria-hidden="true">
        <img src={region.src} alt="" draggable={false} style={style} />
      </div>
    </section>
  );
}
