import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import "./styles.css";

if (/windows/i.test(navigator.userAgent)) {
  document.documentElement.setAttribute("data-platform", "win");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
