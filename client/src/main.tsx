import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { initNativeFeatures } from "./lib/native-app";

initNativeFeatures();

createRoot(document.getElementById("root")!).render(<App />);
