import type { ReactNode } from "react";

type AuthCardProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

export default function AuthCard({ title, subtitle, children, footer, className = "" }: AuthCardProps) {
  return (
    <section
      className={[
        "animate-slide-up relative w-full max-w-md overflow-hidden rounded-3xl border border-zinc-800/80",
        "bg-zinc-950/75 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl transition-all duration-300",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-zinc-400/60 to-transparent" />
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">{title}</h1>
        <p className="text-sm text-zinc-400">{subtitle}</p>
      </header>
      {children}
      {footer ? (
        <footer className="mt-6 border-t border-zinc-800 pt-4 text-sm text-zinc-400">{footer}</footer>
      ) : null}
    </section>
  );
}
