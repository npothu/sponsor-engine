import {
  getAllSettings,
  listCycles,
  listCurrentSponsorNames,
  resolveAnchorEvent,
} from "@/lib/data";
import { updateGeneralSettingsAction, setActiveCycleAction } from "./actions";
import { PageHeader, SectionHeading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export default async function GeneralSettingsPage() {
  const settingsMap = await getAllSettings();
  const cycles = await listCycles();
  const activeCycle = cycles.find((c) => c.isActive) ?? null;

  const revenueGoal = settingsMap.revenue_goal ?? "";
  const anchorTarget = settingsMap.anchor_target ?? "";
  const weeklyQuota = settingsMap.weekly_launch_quota ?? "";
  const yourName = settingsMap.your_name ?? "";

  const memberCount = settingsMap.member_count ?? "";
  const hackathonReach = settingsMap.hackathon_reach ?? "";
  const currentSponsors = settingsMap.current_sponsors ?? "";
  const anchorEventOverride = settingsMap.anchor_event ?? "";

  // Computed defaults shown as placeholders so the user sees what the merge
  // fields resolve to when the override is left blank.
  const computedSponsors = await listCurrentSponsorNames();
  const computedSponsorsLabel =
    computedSponsors.length > 0 ? computedSponsors.join(", ") : "no live sponsors yet";
  const computedAnchorEvent = await resolveAnchorEvent();

  return (
    <div className="max-w-[640px]">
      <PageHeader
        title="Settings"
        subtitle="Your name, revenue goal, anchor target, and other org-wide settings."
      />

      <div className="space-y-6">
        <Card className="gap-3 px-5">
          <SectionHeading>Current cycle</SectionHeading>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The sponsorship cycle used by the Today dashboard, Board default
            filter, and Revenue page. Rollover a cycle from the Cycles page,
            then set it active here.
          </p>

          {cycles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cycles yet. Create one from the Cycles page.
            </p>
          ) : (
            <form action={setActiveCycleAction} className="flex items-center gap-2.5">
              <Select
                name="cycleId"
                wrapperClassName="flex-1"
                defaultValue={activeCycle?.id ?? cycles[0]?.id}
              >
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {c.isActive ? " (active)" : ""}
                  </option>
                ))}
              </Select>
              <Button type="submit">Set active</Button>
            </form>
          )}

          {activeCycle && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Active cycle: <strong className="font-semibold text-foreground">{activeCycle.label}</strong>
              {activeCycle.anchorEvent ? ` - ${activeCycle.anchorEvent}` : ""}
            </p>
          )}
        </Card>

        <Card className="px-5">
          <form action={updateGeneralSettingsAction} className="flex flex-col gap-3">
            <SectionHeading>General settings</SectionHeading>

            <div className="space-y-1">
              <Label htmlFor="revenue_goal">Revenue goal ($)</Label>
              <Input
                id="revenue_goal"
                name="revenue_goal"
                type="number"
                min={0}
                step={1}
                defaultValue={revenueGoal}
                placeholder="e.g. 25000"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Total sponsorship dollars targeted for the current cycle. Drives
                the goal progress bar on the Revenue page.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="anchor_target">Anchor target</Label>
              <Input
                id="anchor_target"
                name="anchor_target"
                type="number"
                min={0}
                step={1}
                defaultValue={anchorTarget}
                placeholder="e.g. 3"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Number of Gold-level anchor sponsors you are aiming for (2-3 for
                the Spring hackathon). Drives the anchor tracker slots on the
                Revenue page.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="weekly_launch_quota">Weekly outreach quota</Label>
              <Input
                id="weekly_launch_quota"
                name="weekly_launch_quota"
                type="number"
                min={1}
                step={1}
                defaultValue={weeklyQuota}
                placeholder="e.g. 10"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                New prospects to launch (and follow up on) each week. Sets the
                target for the Today scoreboard&rsquo;s new-touch metric and caps
                this week&rsquo;s launch cohort. Defaults to 10 when blank.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="your_name">Your name</Label>
              <Input
                id="your_name"
                name="your_name"
                type="text"
                defaultValue={yourName}
                placeholder="e.g. Alex"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Used to fill the {"{{your_name}}"} merge field in outreach
                templates.
              </p>
            </div>

            <div className="pt-2">
              <SectionHeading>Proof points</SectionHeading>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Credibility numbers surfaced in cold outreach. These fill the{" "}
                {"{{member_count}}"}, {"{{hackathon_reach}}"},{" "}
                {"{{current_sponsors}}"}, and {"{{anchor_event}}"} merge fields.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="member_count">Member count</Label>
              <Input
                id="member_count"
                name="member_count"
                type="text"
                defaultValue={memberCount}
                placeholder="e.g. 411 members"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Fills {"{{member_count}}"}. Free text, e.g. &ldquo;411
                members&rdquo;.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="hackathon_reach">Hackathon reach</Label>
              <Input
                id="hackathon_reach"
                name="hackathon_reach"
                type="text"
                defaultValue={hackathonReach}
                placeholder="e.g. 200+ hackathon participants"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Fills {"{{hackathon_reach}}"}. Free text describing the anchor
                event&rsquo;s audience.
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="current_sponsors">Current sponsors (override)</Label>
              <Input
                id="current_sponsors"
                name="current_sponsors"
                type="text"
                defaultValue={currentSponsors}
                placeholder={computedSponsorsLabel}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Fills {"{{current_sponsors}}"}. Leave blank to compute from live
                committed deals - currently{" "}
                <strong className="font-semibold text-foreground">
                  {computedSponsorsLabel}
                </strong>
                .
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="anchor_event">Anchor event (override)</Label>
              <Input
                id="anchor_event"
                name="anchor_event"
                type="text"
                defaultValue={anchorEventOverride}
                placeholder={computedAnchorEvent || "e.g. Spring 2027 Hackathon"}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Fills {"{{anchor_event}}"}. Leave blank to use the active
                cycle&rsquo;s anchor event
                {computedAnchorEvent ? (
                  <>
                    {" "}-{" "}
                    <strong className="font-semibold text-foreground">
                      {computedAnchorEvent}
                    </strong>
                  </>
                ) : null}
                .
              </p>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit">Save settings</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
