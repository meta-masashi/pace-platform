import type { NextConfig } from "next";

// Pages that live at root level (inside the (dashboard) route group)
// Add redirects so /dashboard/* also works as an alias
const dashboardAliases = [
  "triage",
  "schedule",
  "players",
  "assessment",
  "rehabilitation",
  "team-training",
  "community",
  "stats",
  "settings",
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "hachi-riskon.com"],
    },
  },
  async redirects() {
    return dashboardAliases.map((page) => ({
      source: `/dashboard/${page}`,
      destination: `/${page}`,
      permanent: false,
    }));
  },
};

export default nextConfig;
