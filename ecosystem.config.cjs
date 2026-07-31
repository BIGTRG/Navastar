module.exports = {
  apps: [{
    name: "navastar-api",
    script: "npx",
    args: "tsx apps/api/src/index.ts",
    cwd: "/var/www/Navastar",
    env: {
      DATABASE_URL: "postgresql://navastar:Navastar2026!@localhost:5432/navastar?schema=public",
      JWT_SECRET: "navastar-prod-jwt-2026-trg-techlink-secure-key-64chars",
      JWT_EXPIRES_IN: "7d",
      NODE_ENV: "production",
      API_PORT: "4050",
      STORAGE_PROVIDER: "stub",
      MAP_PROVIDER: "osm",
      AI_PROVIDER: "stub",
      ESCROW_PROVIDER: "stub",
      PAYMENT_PROVIDER: "stub",
      ENABLE_DEMO: "true",
      EVENT_BUS: "inprocess",
      AI_CONFIDENCE_THRESHOLD: "0.75"
    }
  }]
};
