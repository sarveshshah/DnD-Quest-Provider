"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
    const [theme, setTheme] = useState<"light" | "dark">("dark");

    useEffect(() => {
        const stored = localStorage.getItem("theme");
        if (stored === "light" || stored === "dark") {
            setTheme(stored);
            document.documentElement.classList.toggle("dark", stored === "dark");
        } else {
            const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            setTheme(isDark ? "dark" : "light");
            document.documentElement.classList.toggle("dark", isDark);
        }
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
        localStorage.setItem("theme", newTheme);
        document.documentElement.classList.toggle("dark", newTheme === "dark");
    };

    return (
        <button
            onClick={toggleTheme}
            className="fixed top-6 right-8 z-50 p-3 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 hover:bg-slate-300 dark:hover:bg-zinc-700 transition-colors shadow-md"
            title="Toggle Theme"
        >
            <span className="material-symbols-outlined !text-xl flex items-center justify-center">
                {theme === "light" ? "dark_mode" : "light_mode"}
            </span>
        </button>
    );
}
