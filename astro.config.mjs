import { defineConfig } from "astro/config";

export default defineConfig({
  server: { host: "localhost", port: 4321 },
  devToolbar: { enabled: false },
});
