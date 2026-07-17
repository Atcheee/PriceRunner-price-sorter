import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Settings3 } from "@/components/settings-3";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Settings3 />
  </StrictMode>,
);
