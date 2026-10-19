import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import XRayApp from "./xray/XRayApp";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <XRayApp demo />
  </StrictMode>
);
