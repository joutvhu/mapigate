import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { useBackdropClose } from "../hooks/useBackdropClose.js";

export interface PortalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
  className?: string;
}

export const PortalDrawer: React.FC<PortalDrawerProps> = ({
  isOpen,
  onClose,
  children,
  maxWidthClass = "max-w-2xl sm:max-w-3xl",
  className = "",
}) => {
  const { backdropProps } = useBackdropClose(onClose, !isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = origOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex justify-end bg-black/70 backdrop-blur-xs animate-rt-fade-in"
      {...backdropProps}
    >
      <div
        className={`w-full ${maxWidthClass} h-full bg-[#0D121F] border-l border-[#1E293B] shadow-2xl flex flex-col text-slate-100 overflow-hidden animate-rt-slide-in-right ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
