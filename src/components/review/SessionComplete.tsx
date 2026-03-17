import { motion } from "framer-motion";
import { formatDuration } from "@/lib/time";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/button";

interface SessionCompleteProps {
  cardsReviewed: number;
  startedAt: number;
  ratingsGiven: Record<number, number>;
  onDone: () => void;
}

export function SessionComplete({
  cardsReviewed,
  startedAt,
  ratingsGiven,
  onDone,
}: SessionCompleteProps) {
  const elapsed = Date.now() - startedAt;
  const goodOrEasy = (ratingsGiven[3] ?? 0) + (ratingsGiven[4] ?? 0);
  const retention = cardsReviewed > 0
    ? Math.round((goodOrEasy / cardsReviewed) * 100)
    : 0;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
      <motion.div
        className="text-blue-600 mb-4"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        <Icon name="celebration" size={48} />
      </motion.div>

      <motion.h2
        className="text-2xl font-semibold mb-2"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        Session Complete
      </motion.h2>

      <motion.p
        className="text-muted-foreground mb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Nice work! Here&apos;s how you did.
      </motion.p>

      <motion.div
        className="w-full space-y-3 mb-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <StatRow label="Cards reviewed" value={String(cardsReviewed)} />
        <StatRow label="Time" value={formatDuration(elapsed)} />
        <StatRow label="Retention" value={`${retention}%`} />
        <div className="flex justify-between text-sm pt-2 border-t border-gray-200 dark:border-gray-800">
          <span className="text-red-500">Again: {ratingsGiven[1] ?? 0}</span>
          <span className="text-orange-500">Hard: {ratingsGiven[2] ?? 0}</span>
          <span className="text-green-500">Good: {ratingsGiven[3] ?? 0}</span>
          <span className="text-blue-500">Easy: {ratingsGiven[4] ?? 0}</span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <Button size="lg" onClick={onDone}>
          Back to Decks
        </Button>
      </motion.div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
