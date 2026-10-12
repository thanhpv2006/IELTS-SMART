import type { Metadata } from "next";
import { Inter } from "next/font/google";
// The engine ships its own full Tailwind build, including unprefixed `.flex`/`.hidden`/`.block`
// with NO responsive variants. It must load BEFORE globals.css, or those base utilities win the
// cascade over every `hidden sm:block` / `flex lg:hidden` in this app and freeze them at one state.
import "@novaforge-team/ielts-exam-engine/styles.css";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { getBrand } from "@/brand/server";
import { BrandProvider } from "@/brand/context";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: brand.title,
    description: brand.description,
    icons: { icon: brand.icon },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  return (
    // The ramp rides on an inline style so it outranks every selector, whatever order the
    // engine's stylesheet and globals.css end up in.
    <html lang="vi" style={brand.palette as React.CSSProperties}>
      <body className={cn(inter.variable, "font-sans")}>
        <BrandProvider brand={brand}>
          <Providers>{children}</Providers>
        </BrandProvider>
      </body>
    </html>
  );
}
