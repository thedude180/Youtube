import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { initNativeFeatures } from "./lib/native-app";
import { initWebVitals } from "./lib/web-vitals";

initNativeFeatures();
initWebVitals();

const root = document.getElementById("root")!;

try {
  createRoot(root).render(<App />);
} catch (err) {
  console.error("Failed to render app:", err);
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a14;color:#fff;font-family:system-ui,sans-serif;">
      <div style="text-align:center;max-width:400px;padding:2rem;">
        <h2 style="margin-bottom:0.5rem;">Loading CreatorOS...</h2>
        <p style="color:#999;margin-bottom:1.5rem;">If this persists, try clearing your browser cache.</p>
        <button onclick="caches.keys().then(k=>Promise.all(k.map(n=>caches.delete(n)))).then(()=>location.reload())" style="padding:0.75rem 1.5rem;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">
          Reload App
        </button>
      </div>
    </div>
  `;
}
