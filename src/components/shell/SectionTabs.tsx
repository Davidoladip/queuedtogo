"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  ["forms", "Event forms"],
  ["submissions", "Submissions"],
  ["board", "Production board"],
  ["notifications", "Notifications"],
  ["tracking", "Tracking"],
  ["settings", "Settings"],
] as const;

export function SectionTabs({ orgSlug }: { orgSlug: string }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="Sections">
      {SECTIONS.map(([key, label]) => {
        const href = `/w/${orgSlug}/${key}`;
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link key={key} href={href} className="tab" aria-current={active ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
