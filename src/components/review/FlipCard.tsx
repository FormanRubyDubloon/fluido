import { forwardRef } from "react";
import { motion } from "framer-motion";
import { CardFace } from "./CardFace";

interface FlipCardProps {
  frontHtml: string;
  backHtml: string;
  css: string;
  isRevealed: boolean;
  onFlip: () => void;
}

export const FlipCard = forwardRef<HTMLDivElement, FlipCardProps>(
  ({ frontHtml, backHtml, css, isRevealed, onFlip }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full cursor-pointer select-none"
        style={{ perspective: 1000 }}
        onClick={!isRevealed ? onFlip : undefined}
      >
        <motion.div
          animate={{ rotateY: isRevealed ? 180 : 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          style={{ transformStyle: "preserve-3d" }}
          className="relative"
        >
          {/* Front face — always in flow, sets min height */}
          <div
            data-face="front"
            className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
            style={{
              backfaceVisibility: "hidden",
              visibility: isRevealed ? "hidden" : "visible",
            }}
          >
            <CardFace html={frontHtml} css={css} />
          </div>

          {/* Back face — absolute but only visible when flipped */}
          <div
            data-face="back"
            className={`rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 ${
              isRevealed ? "relative" : "absolute inset-0"
            }`}
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              visibility: isRevealed ? "visible" : "hidden",
            }}
          >
            <CardFace html={backHtml} css={css} />
          </div>
        </motion.div>
      </div>
    );
  }
);

FlipCard.displayName = "FlipCard";
