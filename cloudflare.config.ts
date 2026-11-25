import { defineConfig } from "cf/config";

const customDomains = (process.env.CF_CUSTOM_DOMAIN ?? "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);

export default defineConfig({
  worker: {
    name: process.env.CF_WORKER_NAME || "ai-nav-hub",
    compatibilityDate: "2026-11-01",
    workersDev: true,
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "none",
    },
    ...(customDomains.length > 0 ? { domains: customDomains } : {}),
  },
});
