import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

const NAV_ITEMS = [
  { id: "decks", label: "Decks", icon: "style" },
  { id: "stats", label: "Statistics", icon: "bar_chart" },
  { id: "settings", label: "Settings", icon: "settings" },
] as const;

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => (
        <li key={item.id}>
          <Button
            variant={currentView === item.id ? "secondary" : "ghost"}
            className="w-full justify-start gap-3"
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} size={20} filled={currentView === item.id} />
            {item.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}
