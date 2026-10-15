import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  let apiHost = "https://your-project.supabase.co/*";
  try { apiHost = `${new URL(env.VITE_SUPABASE_URL).origin}/*`; } catch { /* buildable placeholder */ }
  return {
    plugins: [react(), {
      name: "manifest",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "manifest.json", source: JSON.stringify({
          manifest_version: 3,
          name: "CV Maker — Capture a job",
          description: "Capture the job you are viewing and tailor your private CV in CV Maker.",
          version: "0.1.0",
          action: { default_popup: "popup.html", default_title: "Tailor this job" },
          background: { service_worker: "background.js", type: "module" },
          permissions: ["activeTab", "scripting", "storage"],
          host_permissions: [apiHost],
        }, null, 2) });
      },
    }],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: { popup: "popup.html", background: "src/background.ts" },
        output: { entryFileNames: (chunk) => chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js" },
      },
    },
  };
});
