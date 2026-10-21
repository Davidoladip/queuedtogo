"use client";

import { useRouter } from "next/navigation";

export function OrgSwitcher({ current, orgs }: { current: string; orgs: { slug: string; name: string }[] }) {
  const router = useRouter();
  if (orgs.length < 2) return <span className="muted" style={{ fontSize: 13 }}>{orgs[0]?.name}</span>;
  return (
    <select
      aria-label="Switch business"
      value={current}
      onChange={(e) => router.push(`/w/${e.target.value}`)}
      style={{ width: "auto", padding: "5px 8px", fontSize: 13 }}
    >
      {orgs.map((o) => (
        <option key={o.slug} value={o.slug}>{o.name}</option>
      ))}
    </select>
  );
}
