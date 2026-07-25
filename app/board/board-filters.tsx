"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface BoardFiltersProps {
  type: "all" | "corporate" | "community";
  cycle: string; // "" means all cycles
  priority: "all" | "high" | "medium" | "low";
  warmOnly: boolean;
  cycles: string[];
}

const PRIORITY_LABELS: Record<BoardFiltersProps["priority"], string> = {
  all: "All",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Partnership-type, priority, and cycle filters that write to the URL query string. */
export function BoardFilters({
  type,
  cycle,
  priority,
  warmOnly,
  cycles,
}: BoardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col">
        <Label className="mb-1.5">Partnership</Label>
        <div
          className="inline-flex gap-0.5 rounded-lg border border-input bg-muted p-0.5"
          role="group"
          aria-label="Partnership type"
        >
          {(["all", "corporate", "community"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                type === opt && "bg-card text-primary font-semibold shadow-[0_1px_2px_rgba(28,55,32,0.08)] dark:text-lime",
              )}
              onClick={() => setParam("type", opt === "all" ? "" : opt)}
            >
              {opt === "all" ? "All" : opt === "corporate" ? "Corporate" : "Community"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        <Label className="mb-1.5">Priority</Label>
        <div
          className="inline-flex gap-0.5 rounded-lg border border-input bg-muted p-0.5"
          role="group"
          aria-label="Company priority"
        >
          {(["all", "high", "medium", "low"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                priority === opt &&
                  "bg-card text-primary font-semibold shadow-[0_1px_2px_rgba(28,55,32,0.08)] dark:text-lime",
              )}
              onClick={() => setParam("priority", opt === "all" ? "" : opt)}
            >
              {PRIORITY_LABELS[opt]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        <Label htmlFor="board-cycle">Cycle</Label>
        <Select
          id="board-cycle"
          wrapperClassName="w-auto min-w-[140px]"
          value={cycle}
          onChange={(e) => setParam("cycle", e.target.value)}
        >
          <option value="">All cycles</option>
          {cycles.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col">
        <Label className="mb-1.5">Warmth</Label>
        <button
          type="button"
          className={cn(
            "rounded-lg border border-input bg-muted px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            warmOnly &&
              "bg-card text-primary font-semibold shadow-[0_1px_2px_rgba(28,55,32,0.08)] dark:text-lime",
          )}
          aria-pressed={warmOnly}
          onClick={() => setParam("warm", warmOnly ? "" : "1")}
        >
          Warm only
        </button>
      </div>
    </div>
  );
}
