interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const NAV_ITEMS = [
  { id: "decks", label: "Decks", icon: "📚" },
  { id: "stats", label: "Statistics", icon: "📊" },
  { id: "settings", label: "Settings", icon: "⚙️" },
] as const;

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => (
        <li key={item.id}>
          <button
            onClick={() => onNavigate(item.id)}
            className={`
              flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left
              transition-colors text-sm font-medium
              ${
                currentView === item.id
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              }
            `}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
