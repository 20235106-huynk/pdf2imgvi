import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@/index.css"
import { initTheme } from "@/lib/theme"
import { Popup } from "./Popup"

initTheme()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
)
