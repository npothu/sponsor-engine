"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/** A single navigation item. */
export interface NavItem {
  href: string;
  label: string;
}

/** A labeled group of navigation items. */
export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Primary navigation, grouped into labeled sections, in sidebar order. */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Pipeline",
    items: [
      { href: "/", label: "Today" },
      { href: "/board", label: "Board" },
      { href: "/companies", label: "Companies" },
      { href: "/prospects", label: "Prospects" },
    ],
  },
  {
    label: "Outreach",
    items: [
      { href: "/backfill", label: "Backfill" },
      { href: "/templates", label: "Templates" },
      { href: "/cadences", label: "Cadences" },
      { href: "/discord", label: "Discord" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/revenue", label: "Revenue" },
      { href: "/fulfillment", label: "Fulfillment" },
      { href: "/decks", label: "Decks" },
      { href: "/settings/tiers", label: "Tiers" },
    ],
  },
  {
    label: "Org",
    items: [
      { href: "/cycles", label: "Cycles" },
      { href: "/report", label: "Report" },
      { href: "/handoff", label: "Handoff" },
      { href: "/settings/general", label: "Settings" },
      { href: "/settings/audit", label: "Audit Log" },
    ],
  },
];

/** Flat list of all nav items, preserved for callers that want the full set. */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-0.5">
          <div className="mb-1 px-3.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground/80">
            {section.label}
          </div>
          {section.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export default SidebarNav;
