import "server-only";
import { auth } from "@/auth";

/** The logged-in user's id, for attributing audit log writes. Null if unauthenticated. */
export async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const id = session?.user?.id;
  return id ? Number(id) : null;
}
