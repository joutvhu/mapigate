import React from "react";
import { PortalModal } from "./PortalModal.js";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: "danger" | "primary" | "emerald";
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "primary",
  onConfirm,
  onCancel,
}) => {
  const getButtonClass = () => {
    switch (confirmVariant) {
      case "danger":
        return "bg-red-600 hover:bg-red-500 text-white";
      case "emerald":
        return "bg-emerald-600 hover:bg-emerald-500 text-white";
      default:
        return "bg-blue-600 hover:bg-blue-500 text-white";
    }
  };

  return (
    <PortalModal isOpen={isOpen} onClose={onCancel} maxWidthClass="max-w-md">
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <p className="text-sm text-slate-300 leading-relaxed">{message}</p>
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1E293B]">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-[#141B2D] border border-[#1E293B] rounded-xl transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-medium rounded-xl transition-colors cursor-pointer ${getButtonClass()}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </PortalModal>
  );
};
