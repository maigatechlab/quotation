import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  ExpirationPlugin,
} from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: WorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const CACHE_30_DAYS = 60 * 60 * 24 * 30;  // 2592000 secondes
const CACHE_1_YEAR  = 60 * 60 * 24 * 365; // 31536000 secondes

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    // 1. Endpoints sync — NetworkOnly (la queue Dexie gère les mutations offline)
    {
      matcher: /\/api\/v1\/sync\//,
      handler: new NetworkOnly(),
    },
    // 2. Auth / sécurité — NetworkOnly strict (permissions périmées = faille sécurité)
    {
      matcher: /\/api\/auth(\/|$)/,
      handler: new NetworkOnly(),
    },
    // 3. API lecture — NetworkFirst avec fallback cache 30 jours (FR-35)
    //    Allowlist explicite: clients, quotes, companies, templates, clauses
    //    Exclut: /api/v1/users (données sensibles — rôles/emails)
    {
      matcher: /\/api\/v1\/(clients|quotes|companies|templates|clauses)(\/|$)/,
      handler: new NetworkFirst({
        cacheName: "api-read-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: CACHE_30_DAYS,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // 4. Next.js chunks immutables — CacheFirst 1 an (hash dans le nom de fichier)
    {
      matcher: /\/_next\/static\//,
      handler: new CacheFirst({
        cacheName: "next-static-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: CACHE_1_YEAR,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
    // 5. Assets statiques (polices woff2, SVG, PNG, ICO) — CacheFirst 30 jours
    {
      matcher: /\.(woff2?|svg|png|ico)(\?.*)?$/,
      handler: new CacheFirst({
        cacheName: "static-assets-v1",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: CACHE_30_DAYS,
            purgeOnQuotaError: true,
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();
