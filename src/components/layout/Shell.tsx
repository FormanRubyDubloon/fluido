import { useState } from "react";
import { useSettingsStore } from "@/store/settings-store";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

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
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:flex-col w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-gray-800">
            <h1 className="text-lg font-semibold tracking-tight">Fluido</h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle dark mode"
            >
              <Icon name={darkMode ? "light_mode" : "dark_mode"} size={20} />
            </Button>
          </div>
          <nav className="p-3 overflow-y-auto flex-1">
            {sidebar}
          </nav>
        </aside>

        {/* Mobile sidebar (Sheet) */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-gray-800">
              <h1 className="text-lg font-semibold tracking-tight">Fluido</h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDarkMode(!darkMode)}
                aria-label="Toggle dark mode"
              >
                <Icon name={darkMode ? "light_mode" : "dark_mode"} size={20} />
              </Button>
            </div>
            <nav className="p-3" onClick={() => setSidebarOpen(false)}>
              {sidebar}
            </nav>
          </SheetContent>
        </Sheet>

        <main className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center h-14 px-4 border-b border-gray-200 dark:border-gray-800 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="-ml-2"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Icon name="menu" size={24} />
            </Button>
            <h1 className="ml-3 text-lg font-semibold">Fluido</h1>
          </header>
          <div className="flex-1 overflow-y-auto p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
