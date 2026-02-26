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
            className="group fixed top-6 right-8 z-50 h-12 px-3 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200 hover:bg-slate-300 dark:hover:bg-zinc-700 transition-all duration-300 ease-out shadow-md inline-flex items-center justify-center leading-none"
            title="Toggle Theme"
            aria-label="Toggle Theme"
        >
            <span className="overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300 ease-out max-w-0 opacity-0 mr-0 group-hover:max-w-[140px] group-hover:opacity-100 group-hover:mr-2 group-focus-visible:max-w-[140px] group-focus-visible:opacity-100 group-focus-visible:mr-2">
                {theme === "light" ? "Dark Mode" : "Light Mode"}
            </span>
            <span className="material-symbols-outlined !text-xl">
                {theme === "light" ? "dark_mode" : "light_mode"}
            </span>
        </button>
    );
}
