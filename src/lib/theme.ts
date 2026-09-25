import { useEffect, useState } from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "pdf2imgvi_theme"

let currentTheme: Theme = "light"

if (typeof localStorage !== "undefined") {
  const saved = localStorage.getItem(STORAGE_KEY) as Theme | null
  if (saved === "light" || saved === "dark") {
    currentTheme = saved
  } else if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    currentTheme = "dark"
  }
}

const listeners = new Set<(theme: Theme) => void>()

function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }
}

export function getTheme(): Theme {
  return currentTheme
}

export function setTheme(theme: Theme): void {
  currentTheme = theme
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, theme)
  }
  applyTheme(theme)
  for (const listener of listeners) {
    listener(theme)
  }
}

export function toggleTheme(): Theme {
  const next = currentTheme === "light" ? "dark" : "light"
  setTheme(next)
  return next
}

export function initTheme(): void {
  applyTheme(currentTheme)
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getTheme)

  useEffect(() => {
    const handler = (newTheme: Theme) => setThemeState(newTheme)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark: theme === "dark",
  }
}
