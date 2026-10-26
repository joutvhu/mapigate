import { useRef, useEffect, type MouseEvent, type TouchEvent } from "react";

export interface BackdropCloseHandlerOptions {
  onClose?: () => void;
  disabled?: boolean;
}

export interface BackdropEventLike {
  target: any;
  currentTarget: any;
  button?: number;
  detail?: number;
}

export interface BackdropTouchEventLike {
  target: any;
  currentTarget: any;
}

/**
 * Pure handler logic to ensure dialogs, modals, and drawers only close when BOTH
 * mousedown (or touchstart) and mouseup (or touchend) occur directly on the backdrop.
 *
 * This prevents accidental dismissal when a user selects text inside the dialog
 * content and accidentally releases the mouse cursor outside on the backdrop.
 */
export function createBackdropCloseHandler(initialOptions: BackdropCloseHandlerOptions) {
  let options = { ...initialOptions };
  let isBackdropMouseDown = false;
  let isBackdropTouchStart = false;
  let lastClosedAt = 0;

  const updateOptions = (newOptions: BackdropCloseHandlerOptions) => {
    options = { ...newOptions };
  };

  const triggerClose = () => {
    if (options.disabled) return;
    const now = Date.now();
    // Guard against duplicate close calls from emulated mouse events following touch
    if (now - lastClosedAt < 250) return;
    lastClosedAt = now;
    options.onClose?.();
  };

  const handleMouseDown = (e: MouseEvent | BackdropEventLike) => {
    if (options.disabled) return;
    if (e.target === e.currentTarget && (e.button === 0 || e.button === undefined)) {
      isBackdropMouseDown = true;
    } else {
      isBackdropMouseDown = false;
    }
  };

  const handleMouseUp = (e: MouseEvent | BackdropEventLike) => {
    if (options.disabled) {
      isBackdropMouseDown = false;
      return;
    }
    if (isBackdropMouseDown && e.target === e.currentTarget && (e.button === 0 || e.button === undefined)) {
      triggerClose();
    }
    isBackdropMouseDown = false;
  };

  const handleTouchStart = (e: TouchEvent | BackdropTouchEventLike) => {
    if (options.disabled) return;
    if (e.target === e.currentTarget) {
      isBackdropTouchStart = true;
    } else {
      isBackdropTouchStart = false;
    }
  };

  const handleTouchEnd = (e: TouchEvent | BackdropTouchEventLike) => {
    if (options.disabled) {
      isBackdropTouchStart = false;
      return;
    }
    if (isBackdropTouchStart && e.target === e.currentTarget) {
      triggerClose();
    }
    isBackdropTouchStart = false;
  };

  const handleClick = (e: MouseEvent | BackdropEventLike) => {
    if (options.disabled) return;
    // Keyboard activation (Enter/Space on focused backdrop, where detail === 0)
    if (e.detail === 0 && e.target === e.currentTarget) {
      triggerClose();
    }
  };

  const reset = () => {
    isBackdropMouseDown = false;
    isBackdropTouchStart = false;
  };

  return {
    updateOptions,
    handleMouseDown,
    handleMouseUp,
    handleTouchStart,
    handleTouchEnd,
    handleClick,
    reset,
    get isMouseDown() {
      return isBackdropMouseDown;
    },
    get isTouchStart() {
      return isBackdropTouchStart;
    },
  };
}

/**
 * React hook integrating createBackdropCloseHandler with component lifecycle and global window listeners.
 */
export function useBackdropClose(onClose?: () => void, disabled = false) {
  const handlerRef = useRef<ReturnType<typeof createBackdropCloseHandler> | null>(null);
  if (!handlerRef.current) {
    handlerRef.current = createBackdropCloseHandler({ onClose, disabled });
  } else {
    handlerRef.current.updateOptions({ onClose, disabled });
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleGlobalMouseUp = () => {
      handlerRef.current?.reset();
    };
    const handleGlobalTouchEnd = () => {
      handlerRef.current?.reset();
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("touchend", handleGlobalTouchEnd);

    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("touchend", handleGlobalTouchEnd);
    };
  }, []);

  const handler = handlerRef.current;

  return {
    handleBackdropMouseDown: handler.handleMouseDown,
    handleBackdropMouseUp: handler.handleMouseUp,
    handleBackdropTouchStart: handler.handleTouchStart,
    handleBackdropTouchEnd: handler.handleTouchEnd,
    handleBackdropClick: handler.handleClick,
    backdropProps: {
      onMouseDown: handler.handleMouseDown,
      onMouseUp: handler.handleMouseUp,
      onTouchStart: handler.handleTouchStart,
      onTouchEnd: handler.handleTouchEnd,
      onClick: handler.handleClick,
    },
  };
}
