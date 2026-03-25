"use client";

import dynamic from "next/dynamic";

// Lazy load PWA components to avoid SSR webpack resolution errors
const PwaInstallPrompt = dynamic(
  () => import("./pwa-install-prompt").then((m) => ({ default: m.PwaInstallPrompt })),
  { ssr: false }
);
const OfflineIndicator = dynamic(
  () => import("./offline-indicator").then((m) => ({ default: m.OfflineIndicator })),
  { ssr: false }
);
const ServiceWorkerRegistrar = dynamic(
  () => import("./sw-registrar").then((m) => ({ default: m.ServiceWorkerRegistrar })),
  { ssr: false }
);

export function PwaProviders() {
  return (
    <>
      <PwaInstallPrompt />
      <OfflineIndicator />
      <ServiceWorkerRegistrar />
    </>
  );
}
