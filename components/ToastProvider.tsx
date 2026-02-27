"use client";

import {
  createContext,
  type CSSProperties,
  type PropsWithChildren,
  type TouchEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { FaCheckCircle, FaExclamationTriangle, FaInfoCircle, FaTimes } from "react-icons/fa";

type ToastVariant = "success" | "error" | "warning" | "info";

type ToastInput = {
  title?: string;
  description: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastItem = {
  id: string;
  title?: string;
  description: string;
  variant: ToastVariant;
  duration: number;
  isClosing: boolean;
};

type ToastContextValue = {
  show: (input: ToastInput) => string;
  success: (description: string, title?: string) => string;
  error: (description: string, title?: string) => string;
  warning: (description: string, title?: string) => string;
  info: (description: string, title?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

const MAX_TOASTS = 3;

const variantDefaults: Record<ToastVariant, { title: string; duration: number }> = {
  success: { title: "Success", duration: 3200 },
  error: { title: "Error", duration: 6200 },
  warning: { title: "Warning", duration: 5200 },
  info: { title: "Info", duration: 4200 },
};

const variantStyles: Record<ToastVariant, { card: string; icon: string }> = {
  success: {
    card: "border-emerald-500/30 bg-emerald-500/10",
    icon: "text-emerald-400",
  },
  error: {
    card: "border-red-500/35 bg-red-500/10",
    icon: "text-red-400",
  },
  warning: {
    card: "border-amber-500/35 bg-amber-500/10",
    icon: "text-amber-300",
  },
  info: {
    card: "border-sky-500/30 bg-sky-500/10",
    icon: "text-sky-300",
  },
};

function createToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ToastContext = createContext<ToastContextValue | null>(null);

type ToastCardProps = {
  item: ToastItem;
  onDismiss: (id: string) => void;
};

function ToastCard({ item, onDismiss }: ToastCardProps) {
  const [dragX, setDragX] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const style: CSSProperties = {
    transform: `translateX(${dragX}px)`,
    opacity: Math.max(1 - dragX / 220, 0.2),
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.touches[0]?.clientX ?? null);
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) {
      return;
    }
    const currentX = event.touches[0]?.clientX ?? touchStartX;
    const delta = currentX - touchStartX;
    setDragX(delta > 0 ? delta : 0);
  };

  const handleTouchEnd = () => {
    if (dragX > 82) {
      onDismiss(item.id);
    }
    setTouchStartX(null);
    setDragX(0);
  };

  const variantStyle = variantStyles[item.variant];

  return (
    <article
      style={style}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={[
        "pointer-events-auto rounded-xl border p-3 shadow-2xl backdrop-blur-sm transition-transform duration-200",
        "bg-zinc-950/95 text-zinc-100",
        variantStyle.card,
        item.isClosing ? "animate-toast-out" : "animate-toast-in",
      ].join(" ")}
      role="status"
      aria-live={item.variant === "error" ? "assertive" : "polite"}
    >
      <div className="flex items-start gap-3">
        <span className={["mt-0.5", variantStyle.icon].join(" ")}>
          {item.variant === "success" ? (
            <FaCheckCircle className="text-base" />
          ) : item.variant === "error" ? (
            <FaExclamationTriangle className="text-base" />
          ) : item.variant === "warning" ? (
            <FaExclamationTriangle className="text-base" />
          ) : (
            <FaInfoCircle className="text-base" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-100">{item.title || variantDefaults[item.variant].title}</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-300">{item.description}</p>
        </div>

        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="inline-flex size-7 items-center justify-center rounded-md border border-zinc-700/80 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          aria-label="Close notification"
        >
          <FaTimes className="text-[11px]" />
        </button>
      </div>
    </article>
  );
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) =>
      current.map((item) => (item.id === id ? { ...item, isClosing: true } : item)),
    );

    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 180);
  }, []);

  const show = useCallback((input: ToastInput) => {
    const variant = input.variant || "info";
    const defaults = variantDefaults[variant];
    const id = createToastId();
    const next: ToastItem = {
      id,
      title: input.title || defaults.title,
      description: input.description,
      variant,
      duration: input.duration || defaults.duration,
      isClosing: false,
    };

    setToasts((current) => [next, ...current].slice(0, MAX_TOASTS));
    return id;
  }, []);

  const clear = useCallback(() => {
    setToasts([]);
  }, []);

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      show,
      success: (description, title) => show({ description, title, variant: "success" }),
      error: (description, title) => show({ description, title, variant: "error" }),
      warning: (description, title) => show({ description, title, variant: "warning" }),
      info: (description, title) => show({ description, title, variant: "info" }),
      dismiss,
      clear,
    }),
    [show, dismiss, clear],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      <section
        className="pointer-events-none fixed right-3 z-[80] flex w-[calc(100vw-1.5rem)] max-w-sm flex-col gap-2 sm:right-4 sm:w-full"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        aria-label="Notifications"
      >
        {toasts.map((item) => (
          <ToastAutoDismiss key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

type ToastAutoDismissProps = {
  item: ToastItem;
  onDismiss: (id: string) => void;
};

function ToastAutoDismiss({ item, onDismiss }: ToastAutoDismissProps) {
  useEffect(() => {
    if (item.isClosing) {
      return;
    }

    const timer = window.setTimeout(() => {
      onDismiss(item.id);
    }, item.duration);

    return () => window.clearTimeout(timer);
  }, [item.id, item.duration, item.isClosing, onDismiss]);

  return <ToastCard item={item} onDismiss={onDismiss} />;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }
  return context;
}
