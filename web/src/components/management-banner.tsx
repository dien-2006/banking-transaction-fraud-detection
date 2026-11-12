import Image from "next/image";

/** Preserve the desktop artwork and provide real, readable headings on small screens. */
export function ManagementBanner({ src, title, description }: { src: string; title: string; description: string }) {
  return <section className="responsive-staff-banner relative h-60 overflow-hidden rounded-xl border border-red-100">
    <Image src={src} alt="" aria-hidden="true" fill priority className="object-contain" />
    <div className="responsive-staff-banner-copy"><h1>{title}</h1><p>{description}</p></div>
  </section>;
}
