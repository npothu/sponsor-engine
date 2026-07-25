"use client";

import { useMemo, useState } from "react";
import type { Company, Template } from "@/lib/schema";
import { TemplateRow } from "./template-row";
import { PreviewPanel } from "./preview-panel";
import { NewTemplate } from "./new-template";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/page-header";

interface TemplatesWorkspaceProps {
  templates: Template[];
  companies: Company[];
}

const UNSCOPED = "Other";

export function TemplatesWorkspace({ templates, companies }: TemplatesWorkspaceProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    templates[0]?.id ?? null,
  );

  const groups = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const key = t.scenario?.trim() || UNSCOPED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === UNSCOPED) return 1;
      if (b === UNSCOPED) return -1;
      return a.localeCompare(b);
    });
  }, [templates]);

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <SectionHeading>
            {templates.length} template{templates.length === 1 ? "" : "s"}
          </SectionHeading>
          <NewTemplate />
        </div>

        {templates.length === 0 ? (
          <Card className="border-dashed py-10 text-center">
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No templates yet. Create one to start reusing your best outreach
                messages.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(([scenario, group]) => (
              <div key={scenario} className="flex flex-col gap-2">
                <SectionHeading className="text-sm">{scenario}</SectionHeading>
                <div className="flex flex-col gap-2">
                  {group.map((t) => (
                    <TemplateRow
                      key={t.id}
                      template={t}
                      selected={t.id === selectedTemplateId}
                      onSelect={() => setSelectedTemplateId(t.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PreviewPanel
        templates={templates}
        companies={companies}
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={setSelectedTemplateId}
      />
    </div>
  );
}

export default TemplatesWorkspace;
