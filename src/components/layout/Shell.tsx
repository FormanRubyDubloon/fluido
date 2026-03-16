import { useState } from "react";
import { useSettingsStore } from "@/store/settings-store";
import { SyncButton } from "./SyncButton";

interface ShellProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}

export function Shell({ children, sidebar }: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const setDarkMode = useSettingsStore((s) => s.setDarkMode);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="flex h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <aside
          className={`
            fixed inset-y-0 left-0 z-40 w-64 transform bg-gray-50 dark:bg-gray-900
            border-r border-gray-200 dark:border-gray-800
            transition-transform duration-200 ease-in-out
            md:relative md:translate-x-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-gray-800">
            <h1 className="text-lg font-semibold tracking-tight">Fluido</h1>
            <div className="flex items-center gap-1">
              <SyncButton />
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="flex items-center justify-center w-11 h-11 rounded-lg
                           text-gray-500 hover:text-gray-700 hover:bg-gray-200
                           dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800
                           transition-colors"
                aria-label="Toggle dark mode"
              >
                {darkMode ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
          <nav className="p-3 overflow-y-auto h-[calc(100vh-3.5rem)]">
            {sidebar}
          </nav>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center h-14 px-4 border-b border-gray-200 dark:border-gray-800 md:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center justify-center w-11 h-11 -ml-2 rounded-lg
                         text-gray-500 hover:text-gray-700 hover:bg-gray-100
                         dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"
              aria-label="Open sidebar"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <h1 className="ml-3 text-lg font-semibold">Fluido</h1>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}