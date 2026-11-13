import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "@fontsource-variable/fraunces"
import "@fontsource-variable/onest"
import "@fontsource-variable/geist-mono"
import "./index.css"
import App from "./App"
import { PreferencesProvider } from "@/hooks/use-preferences"
import { AuthProvider } from "@/hooks/use-auth"
import { SpeechProvider } from "@/hooks/use-speech"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreferencesProvider>
      <AuthProvider>
        <SpeechProvider>
          <App />
        </SpeechProvider>
      </AuthProvider>
    </PreferencesProvider>
  </StrictMode>,
)
