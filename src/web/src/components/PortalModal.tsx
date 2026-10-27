import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useBackdropClose } from "../hooks/useBackdropClose";

export interface PortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
  className?: string;
  overflowHidden?: boolean;
}

export const PortalModal: React.FC<PortalModalProps> = ({
  isOpen,
  onClose,
  children,
  maxWidthClass = "max-w-xl",
  className = "",
  overflowHidden = false,
}) => {
  const { backdropProps } = useBackdropClose(onClose);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const overflowClass = overflowHidden
    ? "overflow-hidden"
    : className.includes("overflow-")
    ? ""
    : "overflow-visible";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-rt-fade-in"
      {...backdropProps}
    >
      <div
        className={`w-full ${maxWidthClass} bg-[#0F1420] border border-[#1E293B] rounded-2xl shadow-2xl p-6 animate-rt-scale-in text-slate-100 ${overflowClass} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
