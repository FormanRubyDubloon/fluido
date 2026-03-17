import { AnimatePresence, motion } from "framer-motion";

interface AnimatedContentProps {
  viewKey: string;
  children: React.ReactNode;
}

export function AnimatedContent({ viewKey, children }: AnimatedContentProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.15, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
