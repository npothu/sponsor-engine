"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface CycleSelectProps {
  cycle: string;
  cycles: string[];
}

/** Cycle picker that writes ?cycle= to the URL, mirroring the board filter pattern. */
export function CycleSelect({ cycle, cycles }: CycleSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("cycle", value);
    else params.delete("cycle");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="min-w-[160px]">
      <Label htmlFor="revenue-cycle" className="mb-1.5">
        Cycle
      </Label>
      <Select
        id="revenue-cycle"
        value={cycle}
        onChange={(e) => handleChange(e.target.value)}
      >
        {cycles.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    </div>
  );
}
