import "@electricblazor/react/theme.css";
import "@electricblazor/react/styles.css";
import "./styles/app.css";
import "./styles/print.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { loadTheme } from "./state/persistence.ts";

// The skin goes on before the first paint, so a dark skin never flashes light on load.
document.documentElement.setAttribute("data-eb-theme", loadTheme());

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
