import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { getCurrentSchoolServer } from "@/lib/schoolServer";
import { brandingStyleText } from "@/lib/schoolBranding";
import { SchoolProvider } from "@/components/SchoolProvider";
import { colorSchemeBootstrapScript } from "@/lib/colorScheme";
import ColorSchemeSync from "@/components/ColorSchemeSync";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-plus-jakarta" });

export const metadata: Metadata = {
  title: "CBT Platform",
  description: "Computer-based testing and school management platform",
  // Without this, iOS Safari auto-detects and auto-links plain-text
  // emails/phone numbers/dates in page content — turns them blue and
  // underlined unexpectedly, and has been observed interfering with
  // text-overflow:ellipsis truncation on the element it injects into.
  other: { "format-detection": "telephone=no, email=no, address=no, date=no" },
};

// Without an explicit viewport export, Next.js emits no viewport meta tag
// at all, so mobile browsers default to a desktop-style ~980px layout
// viewport and zoom the whole page down to fit. Every `sm:` breakpoint in
// this codebase (640px) was therefore never actually triggering on a real
// phone — the page was always being laid out as if wide enough to clear
// it, just visually shrunk, which is what read as content running off
// the edge / needing horizontal scroll across the app, not only in the
// question bank.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The signed-in user's own school (null when signed out, or for the
  // platform owner). Painted server-side before the first paint so there's
  // no flash of the wrong accent color, and handed to the client so headers
  // and the sidebar show the right school name and logo immediately. A
  // school's /s/<code> login page overrides this with its own branding (see
  // app/s/[schoolCode]/layout.tsx). If the lookup fails, the defaults baked
  // into globals.css apply — never a broken or blank style.
  const school = await getCurrentSchoolServer();

  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable}`}>
      <head>
        {/* Runs before hydration so the dark/light class is set on the
            very first paint — without this, the page would flash light
            mode for a moment even for someone who's chosen dark. */}
        <script dangerouslySetInnerHTML={{ __html: colorSchemeBootstrapScript() }} />
        {school && <style dangerouslySetInnerHTML={{ __html: brandingStyleText(school) }} />}
      </head>
      <body className="font-sans antialiased">
        <ColorSchemeSync />
        <SchoolProvider initialSchool={school}>{children}</SchoolProvider>
      </body>
    </html>
  );
}
