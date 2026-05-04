import { createRoot } from "react-dom/client";
import App from "./v2/App";
import "./index.css";

const root = document.getElementById("root")!;

try {
  createRoot(root).render(<App />);
} catch (err) {
  console.error("Failed to render app:", err);
  root.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a14;color:#fff;font-family:system-ui,sans-serif;">
      <div style="text-align:center;max-width:400px;padding:2rem;">
        <h2 style="margin-bottom:0.5rem;">Loading CreatorOS v2...</h2>
        <p style="color:#999;margin-bottom:1.5rem;">If this persists, try clearing your browser cache.</p>
        <button onclick="location.reload()" style="padding:0.75rem 1.5rem;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;">
          Reload App
        </button>
      </div>
    </div>
  `;
}
