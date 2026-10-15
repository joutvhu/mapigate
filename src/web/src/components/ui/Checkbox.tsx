import React, { useRef, useEffect, useState } from "react";

export type CheckboxSize = "sm" | "md" | "lg";
export type CheckboxVariant = "primary" | "emerald" | "cyan";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> {
  size?: CheckboxSize;
  variant?: CheckboxVariant;
  indeterminate?: boolean;
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  checkboxClassName?: string;
  wrapperClassName?: string;
}

export const CHECKBOX_SIZE_CONFIG: Record<
  CheckboxSize,
  {
    box: string;
    icon: string;
    label: string;
    description: string;
    gap: string;
  }
> = {
  sm: {
    box: "size-4 rounded-[4px]",
    icon: "size-2.5",
    label: "text-xs",
    description: "text-[11px]",
    gap: "gap-2",
  },
  md: {
    box: "size-5 rounded-[5px]",
    icon: "size-3.5",
    label: "text-sm",
    description: "text-xs",
    gap: "gap-2.5",
  },
  lg: {
    box: "size-6 rounded-[6px]",
    icon: "size-4",
    label: "text-base",
    description: "text-sm",
    gap: "gap-3",
  },
};

export const CHECKBOX_VARIANT_CONFIG: Record<
  CheckboxVariant,
  {
    active: string;
    focusRing: string;
    hoverBorder: string;
  }
> = {
  primary: {
    active: "bg-blue-600 border-blue-500 text-white shadow-sm shadow-blue-500/25",
    focusRing: "peer-focus-visible:ring-blue-500/50",
    hoverBorder: "group-hover:border-blue-500/50 hover:border-blue-500/50",
  },
  emerald: {
    active: "bg-emerald-600 border-emerald-500 text-white shadow-sm shadow-emerald-500/25",
    focusRing: "peer-focus-visible:ring-emerald-500/50",
    hoverBorder: "group-hover:border-emerald-500/50 hover:border-emerald-500/50",
  },
  cyan: {
    active: "bg-cyan-600 border-cyan-500 text-white shadow-sm shadow-cyan-500/25",
    focusRing: "peer-focus-visible:ring-cyan-500/50",
    hoverBorder: "group-hover:border-cyan-500/50 hover:border-cyan-500/50",
  },
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      checked: propChecked,
      defaultChecked,
      indeterminate = false,
      onChange,
      size = "md",
      variant = "primary",
      label,
      description,
      disabled = false,
      className = "",
      checkboxClassName = "",
      wrapperClassName = "",
      onClick,
      ...rest
    },
    forwardedRef
  ) => {
    const innerRef = useRef<HTMLInputElement | null>(null);

    const isControlled = propChecked !== undefined;
    const [internalChecked, setInternalChecked] = useState(Boolean(defaultChecked));
    const isChecked = isControlled ? Boolean(propChecked) : internalChecked;

    useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = Boolean(indeterminate);
      }
    }, [indeterminate]);

    const setRef = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      if (!isControlled) {
        setInternalChecked(e.target.checked);
      }
      onChange?.(e.target.checked, e);
    };

    const sizeCfg = CHECKBOX_SIZE_CONFIG[size] || CHECKBOX_SIZE_CONFIG.md;
    const variantCfg = CHECKBOX_VARIANT_CONFIG[variant] || CHECKBOX_VARIANT_CONFIG.primary;
    const isCheckedOrIndeterminate = isChecked || indeterminate;
    const hasDescription = Boolean(description);

    return (
      <label
        className={`group inline-flex select-none transition-opacity ${
          hasDescription ? "items-start" : "items-center"
        } ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${sizeCfg.gap} ${wrapperClassName || className}`}
        onClick={onClick as React.MouseEventHandler<HTMLLabelElement>}
      >
        <div
          className={`relative inline-flex items-center justify-center shrink-0 ${
            hasDescription ? "mt-0.5" : ""
          }`}
        >
          <input
            ref={setRef}
            type="checkbox"
            checked={isChecked}
            disabled={disabled}
            onChange={handleChange}
            aria-checked={indeterminate ? "mixed" : isChecked}
            className="sr-only peer"
            {...rest}
          />
          <div
            className={`flex items-center justify-center border transition-all duration-150 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0A0D14] ${
              sizeCfg.box
            } ${
              isCheckedOrIndeterminate
                ? variantCfg.active
                : `bg-[#0B0F17] border-[#1E293B] text-transparent ${
                    !disabled ? "group-hover:border-slate-500 hover:border-slate-500" : ""
                  }`
            } ${variantCfg.focusRing} ${
              !disabled ? "active:scale-95" : ""
            } ${checkboxClassName}`}
          >
            {/* Checkmark icon */}
            <svg
              className={`transition-all duration-150 ease-out ${sizeCfg.icon} ${
                isChecked && !indeterminate ? "scale-100 opacity-100" : "scale-50 opacity-0"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>

            {/* Indeterminate minus icon */}
            <svg
              className={`transition-all duration-150 ease-out absolute ${sizeCfg.icon} ${
                indeterminate ? "scale-100 opacity-100" : "scale-50 opacity-0"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        </div>

        {(label || description) && (
          <div className="flex flex-col leading-tight min-w-0 justify-center">
            {label && (
              <span
                className={`font-medium text-slate-200 transition-colors ${
                  !disabled ? "group-hover:text-white" : ""
                } ${sizeCfg.label}`}
              >
                {label}
              </span>
            )}
            {description && (
              <span className={`text-slate-400 mt-0.5 ${sizeCfg.description}`}>
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
export default Checkbox;
