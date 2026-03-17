import { Icon } from "@/components/ui/Icon";

interface SessionHeaderProps {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  onEnd: () => void;
}

export function SessionHeader({
  newCount,
  learningCount,
  reviewCount,
  onEnd,
}: SessionHeaderProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <button
        onClick={onEnd}
        className="flex items-center justify-center w-11 h-11 rounded-lg
                   text-gray-500 hover:text-gray-700 hover:bg-gray-100
                   dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800
                   transition-colors text-sm"
      >
        <Icon name="close" size={20} />
      </button>

      <div className="flex items-center gap-4 text-sm font-medium tabular-nums">
        {newCount > 0 && (
          <span className="text-blue-600 dark:text-blue-400">{newCount}</span>
        )}
        {learningCount > 0 && (
          <span className="text-orange-600 dark:text-orange-400">
            {learningCount}
          </span>
        )}
        {reviewCount > 0 && (
          <span className="text-green-600 dark:text-green-400">
            {reviewCount}
          </span>
        )}
      </div>

      <div className="w-11" />
    </div>
  );
}