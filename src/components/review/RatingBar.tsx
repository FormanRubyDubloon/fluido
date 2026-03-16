import { useSettingsStore } from "@/store/settings-store";
import type { Rating } from "@/srs/types";
import type { SchedulePreview } from "@/srs/types";
import { formatInterval } from "@/lib/time";

interface RatingBarProps {
  preview: SchedulePreview;
  onRate: (rating: Rating) => void;
}

const ALL_BUTTONS: { rating: Rating; label: string; color: string }[] = [
  { rating: 1, label: "Again", color: "bg-red-600 hover:bg-red-700 active:bg-red-800" },
  { rating: 2, label: "Hard", color: "bg-orange-600 hover:bg-orange-700 active:bg-orange-800" },
  { rating: 3, label: "Good", color: "bg-green-600 hover:bg-green-700 active:bg-green-800" },
  { rating: 4, label: "Easy", color: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800" },
];

const SIMPLE_BUTTONS: { rating: Rating; label: string; color: string }[] = [
  { rating: 1, label: "Again", color: "bg-red-600 hover:bg-red-700 active:bg-red-800" },
  { rating: 3, label: "Good", color: "bg-green-600 hover:bg-green-700 active:bg-green-800" },
];

function getInterval(preview: SchedulePreview, rating: Rating): number {
  switch (rating) {
    case 1: return preview.again.interval;
    case 2: return preview.hard.interval;
    case 3: return preview.good.interval;
    case 4: return preview.easy.interval;
  }
}

export function RatingBar({ preview, onRate }: RatingBarProps) {
  const simpleMode = useSettingsStore((s) => s.simpleRatingMode);
  const buttons = simpleMode ? SIMPLE_BUTTONS : ALL_BUTTONS;

  return (
    <div className="flex gap-2 w-full max-w-lg mx-auto">
      {buttons.map((btn) => (
        <button
          key={btn.rating}
          onClick={() => onRate(btn.rating)}
          className={`
            flex-1 flex flex-col items-center justify-center gap-1
            py-3 rounded-xl text-white font-medium
            transition-colors min-h-[60px]
            ${btn.color}
          `}
        >
          <span className="text-sm">{btn.label}</span>
          <span className="text-xs opacity-80">
            {formatInterval(getInterval(preview, btn.rating))}
          </span>
        </button>
      ))}
    </div>
  );
}