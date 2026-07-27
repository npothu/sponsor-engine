import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Poppins } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { SidebarNav } from "@/components/nav";
import { QuickLog } from "@/components/quick-log";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: "Sponsor Engine",
  description:
    "Local-first sponsorship pipeline tracker - pitch, track, and close corporate and community sponsors.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fraunces.variable} ${poppins.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
        >
          <div className="grid min-h-screen grid-cols-[232px_1fr]">
            <aside className="sticky top-0 flex h-screen flex-col gap-5 overflow-y-auto border-r border-sidebar-border bg-sidebar px-3 py-5 text-sidebar-foreground">
              <div className="px-2">
                <Link
                  href="/"
                  className="font-display text-[1.35rem] font-bold leading-none tracking-tight"
                >
                  Sponsor{" "}
                  <span className="text-primary dark:text-lime">Engine</span>
                </Link>
                <div
                  className="gradient-brand mt-2.5 h-1 w-24 rounded-full"
                  aria-hidden
                />
              </div>

              <SidebarNav role={session?.user?.role} />

              <div className="mt-auto px-2 pt-4 text-[11px] font-medium text-muted-foreground">
                Sponsorship CRM
              </div>
            </aside>

            <div className="flex min-w-0 flex-col">
              <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/85 px-6 backdrop-blur-md">
                <span className="text-sm font-medium text-muted-foreground">
                  Sponsorship pipeline
                </span>
                <div className="flex items-center gap-2">
                  <QuickLog />
                  <ThemeToggle />
                </div>
              </header>
              <main className="w-full max-w-[1200px] px-7 pb-14 pt-7">
                {children}
              </main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
