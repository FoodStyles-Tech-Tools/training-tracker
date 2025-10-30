import { MouseEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  contentClassName?: string;
  overlayClassName?: string;
}

export function Modal({
  open,
  onClose,
  children,
  contentClassName,
  overlayClassName,
}: ModalProps) {
  if (!open) {
    return null;
  }

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  };

  return (
    <div
      className={cn("fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4", overlayClassName)}
      onClick={handleOverlayClick}
    >
      <div
        className={cn(
          "w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-2xl",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

