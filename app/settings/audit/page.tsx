import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listRecentAuditLog } from "@/lib/data";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AuditLogPage() {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/");
  }

  const entries = await listRecentAuditLog(200);

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Who changed what - the most recent 200 changes, for after-the-fact review in case something needs to be untangled."
      />
      <Card className="p-0">
        {entries.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No changes recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Row</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatTimestamp(entry.occurredAt)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.userEmail ?? (
                      <span className="text-muted-foreground italic">
                        system / importer
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        entry.action === "delete"
                          ? "destructive"
                          : entry.action === "insert"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{entry.tableName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    #{entry.rowId}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
