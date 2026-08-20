import { lazy, Suspense, useEffect, useState } from "react";
import { HomeScreen, type EditorLaunchIntent } from "@/features/home/HomeScreen";

const EditorWorkspace = lazy(() => import("@/features/editor/EditorWorkspace").then((module) => ({ default: module.EditorWorkspace })));

export type ThemePreference = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "free-pdf-theme";

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") {
    return preference;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme(): ThemePreference {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export default function App() {
  const [theme, setTheme] = useState<ThemePreference>(getInitialTheme);
  const [openedFile, setOpenedFile] = useState<File | null>(null);
  const [launchIntent, setLaunchIntent] = useState<EditorLaunchIntent>("select");

  useEffect(() => {
    const updateDocumentTheme = () => {
      document.documentElement.dataset.theme = resolveTheme(theme);
    };

    updateDocumentTheme();
    localStorage.setItem(THEME_STORAGE_KEY, theme);

    if (theme !== "system") {
      return undefined;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    query.addEventListener("change", updateDocumentTheme);
    return () => query.removeEventListener("change", updateDocumentTheme);
  }, [theme]);

  const handleOpen = (file: File, intent: EditorLaunchIntent) => {
    setLaunchIntent(intent);
    setOpenedFile(file);
  };

  if (openedFile) {
    return <Suspense fallback={<div className="app-loading">Preparando el editor local…</div>}><EditorWorkspace
      file={openedFile}
      initialTool={launchIntent}
      theme={theme}
      onThemeChange={setTheme}
      onClose={() => setOpenedFile(null)}
      onOpenAnother={(file, intent) => handleOpen(file, intent)}
    /></Suspense>;
  }

  return <HomeScreen theme={theme} onThemeChange={setTheme} onOpen={handleOpen} />;
}
