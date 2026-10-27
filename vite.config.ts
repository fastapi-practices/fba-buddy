import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "")
  const backendOrigin = (
    env.VITE_GLOB_API_URL || "http://127.0.0.1:8000"
  ).replace(/\/$/, "")

  return {
    base: "./",
    plugins: [react(), tailwindcss()],
    build: {
      rolldownOptions: {
        input: {
          app: path.resolve(import.meta.dirname, "index.html"),
          renderings: path.resolve(
            import.meta.dirname,
            "conversation-renderings.html"
          ),
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
      dedupe: ["react", "react-dom"],
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: false,
      open: false,
      proxy: {
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
          ws: true,
        },
      },
    },
  }
})
