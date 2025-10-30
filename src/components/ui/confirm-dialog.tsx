import { ReactNode } from "react";

import { Button, ButtonProps } from "@/components/ui/button";

import { Modal } from "./modal";

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmProps?: Partial<ButtonProps>;
  cancelProps?: Partial<ButtonProps>;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  confirmProps,
  cancelProps,
}: ConfirmDialogProps) {
  const confirmDisabled = confirmProps?.disabled;
  const cancelDisabled = cancelProps?.disabled;

  return (
    <Modal open={open} onClose={cancelDisabled ? undefined : onCancel} contentClassName="max-w-lg">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold leading-tight text-slate-50">{title}</h2>
          {description ? <div className="text-sm text-slate-300">{description}</div> : null}
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant={cancelProps?.variant ?? "outline"}
            onClick={cancelProps?.onClick ?? onCancel}
            disabled={cancelDisabled}
            className={cancelProps?.className}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmProps?.variant ?? "primary"}
            onClick={confirmProps?.onClick ?? onConfirm}
            disabled={confirmDisabled}
            className={confirmProps?.className}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

