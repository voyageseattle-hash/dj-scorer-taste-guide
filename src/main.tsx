import { createRoot } from "react-dom/client";
import TasteGuide from "./pages/TasteGuide";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <><header className="brand"><span className="brand-mark">D/S</span><strong>DJ SCORER</strong><span>TASTE GUIDE</span></header><main><TasteGuide /></main><footer>A focused module from the DJ Scorer prototype. Qloo grounds the cultural relationships; DJ Scorer builds the practice plan. <a href="/about">About this demo</a></footer></>,
);
