import { useRef } from "react";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";

const COMMIT_DISTANCE = 160;
const COMMIT_VELOCITY = 900;

interface SwipeableRowProps {
  children: React.ReactNode;
  swipeEnabled?: boolean;
  onClick?: () => void;
  /** Label shown when swiping right; null = at the end of the sequence, swipe right does nothing. */
  nextLabel: string | null;
  /** Label shown when swiping left; null = at the start of the sequence, swipe left does nothing. */
  prevLabel: string | null;
  onCommitRight?: () => void;
  onCommitLeft?: () => void;
}

export function SwipeableRow({
  children,
  swipeEnabled = false,
  onClick,
  nextLabel,
  prevLabel,
  onCommitRight,
  onCommitLeft,
}: SwipeableRowProps) {
  const hasDraggedRef = useRef(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-8, 8]);
  const rightLabelOpacity = useTransform(x, [0, COMMIT_DISTANCE], [0, 1]);
  const leftLabelOpacity = useTransform(x, [-COMMIT_DISTANCE, 0], [1, 0]);

  const handleDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const { offset, velocity } = info;
    const commitRight = offset.x > COMMIT_DISTANCE || velocity.x > COMMIT_VELOCITY;
    const commitLeft = offset.x < -COMMIT_DISTANCE || velocity.x < -COMMIT_VELOCITY;

    if (commitRight && nextLabel) {
      onCommitRight?.();
    } else if (commitLeft && prevLabel) {
      onCommitLeft?.();
    }
  };

  if (!swipeEnabled) {
    return (
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition active:scale-[0.98]"
      >
        {children}
      </button>
    );
  }

  return (
    <div className="relative">
      {nextLabel && (
        <motion.div
          style={{ opacity: rightLabelOpacity }}
          className="absolute inset-0 flex items-center justify-start rounded-xl bg-green-500/20 px-4"
          aria-hidden="true"
        >
          <span className="text-xs font-semibold text-green-400">→ {nextLabel}</span>
        </motion.div>
      )}
      {prevLabel && (
        <motion.div
          style={{ opacity: leftLabelOpacity }}
          className="absolute inset-0 flex items-center justify-end rounded-xl bg-red-500/20 px-4"
          aria-hidden="true"
        >
          <span className="text-xs font-semibold text-red-400">{prevLabel} ←</span>
        </motion.div>
      )}
      <motion.div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") onClick?.();
        }}
        drag="x"
        dragSnapToOrigin
        style={{ x, rotate }}
        onDragStart={() => {
          hasDraggedRef.current = true;
        }}
        onDragEnd={handleDragEnd}
        onTap={() => {
          if (hasDraggedRef.current) {
            hasDraggedRef.current = false;
            return;
          }
          onClick?.();
        }}
        className="relative flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left"
      >
        {children}
      </motion.div>
    </div>
  );
}
