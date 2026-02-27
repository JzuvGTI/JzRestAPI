"use client";

import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", error, id, label, type = "text", ...rest }, ref) => {
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </label>
        <input
          ref={ref}
          id={id}
          type={type}
          aria-invalid={Boolean(error)}
          className={[
            "h-11 w-full rounded-lg border bg-white px-3 text-sm text-zinc-900 outline-none",
            "border-zinc-300 placeholder:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-100",
            "transition-all duration-200 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500/40",
            error ? "border-red-400/80 focus:border-red-400 focus:ring-red-400/30" : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    );
  },
);

Input.displayName = "Input";

export default Input;
