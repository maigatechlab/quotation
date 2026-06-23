import localFont from "next/font/local";

export const spectral = localFont({
  src: [
    { path: "./fonts/spectral-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/spectral-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/spectral-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/spectral-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-spectral",
  display: "swap",
});

export const hankenGrotesk = localFont({
  src: [
    { path: "./fonts/hanken-grotesk-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/hanken-grotesk-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/hanken-grotesk-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/hanken-grotesk-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-hanken-grotesk",
  display: "swap",
});
