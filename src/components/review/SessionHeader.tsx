import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";

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
      <Button variant="ghost" size="icon" onClick={onEnd}>
        <Icon name="close" size={20} />
      </Button>

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

      <div className="w-10" />
    </div>
  );
}
