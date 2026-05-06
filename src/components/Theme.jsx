"use client";

import { useEffect, useState } from "react";

const KEY = "planner.theme";

// Inline script that runs before React hydrates, so the dark class is on
// <html> before first paint — avoids a white flash on reload.
export const themeBootScript = `
(function(){try{
  var t = localStorage.getItem(${JSON.stringify(KEY)});
  if (t === "dark") document.documentElement.classList.add("dark");
}catch(e){}})();
`;

export function useTheme() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  const toggle = () => {
    // Read the DOM so we never desync from a class set by the boot script.
    const isDark = document.documentElement.classList.contains("dark");
    const next = isDark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  };

  return { theme, toggle };
}
