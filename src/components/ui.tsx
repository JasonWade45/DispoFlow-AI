"use client";

import { useEffect, type ReactNode } from "react";
import { cx } from "@/lib/format";

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  type = "button",
  disabled,
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const variants: Record<string, string> = {
    primary: "bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-400",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-300",
  };
  const sizes: Record<string, string> = {
    sm: "h-8 px-3 text-xs",
    md: "h-9 px-4 text-sm",
    lg: "h-11 px-5 text-sm",
  };
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

const TONES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  orange: "bg-orange-50 text-orange-700 ring-orange-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  purple: "bg-purple-50 text-purple-700 ring-purple-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-200",
};

export function statusTone(status: string): string {
  const map: Record<string, string> = {
    // property
    Available: "emerald",
    Marketing: "indigo",
    "Offer Received": "amber",
    "Under Contract": "violet",
    Pending: "orange",
    Sold: "emerald",
    "On Hold": "slate",
    Cancelled: "rose",
    // task
    "Needs Scheduling": "purple",
    Scheduled: "sky",
    Due: "amber",
    Overdue: "rose",
    Completed: "emerald",
    // buyer
    Active: "emerald",
    Inactive: "slate",
    "Do Not Contact": "rose",
    // interest
    New: "sky",
    Interested: "emerald",
    Undecided: "amber",
    "Needs Information": "blue",
    "Price Concern": "orange",
    "Offer Submitted": "indigo",
    Counteroffer: "violet",
    Accepted: "emerald",
    "Not Interested": "slate",
    "No Response": "rose",
    "Closed — Won": "emerald",
    "Closed — Lost": "slate",
    // offers
    Draft: "slate",
    Submitted: "sky",
    "Under Review": "amber",
    Countered: "violet",
    Rejected: "rose",
    Withdrawn: "slate",
    Expired: "orange",
    // relationship
    Paused: "slate",
    Closed: "slate",
  };
  return TONES[map[status] ?? "slate"] ?? TONES.slate;
}

export function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        statusTone(label),
        className,
      )}
    >
      {label}
    </span>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const sizes = { md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="fixed inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "relative z-10 my-8 w-full rounded-xl bg-white shadow-xl ring-1 ring-slate-200",
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const controlClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(controlClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(controlClass, "min-h-20 resize-y", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(controlClass, "appearance-none pr-8", props.className)} />;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={cx(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            active === t
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 7h18M3 12h18M3 17h10" />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {body && <p className="max-w-sm text-xs text-slate-500">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      {label ?? "Working…"}
    </div>
  );
}

export function DirectionIcon({ direction }: { direction: string }) {
  const map: Record<string, { text: string; bg: string; d: string }> = {
    in: { text: "text-emerald-600", bg: "bg-emerald-50", d: "M7 17L17 7M17 7H9M17 7v8" },
    out: { text: "text-sky-600", bg: "bg-sky-50", d: "M17 7L7 17M7 17h8M7 17V9" },
    internal: { text: "text-amber-600", bg: "bg-amber-50", d: "M12 6v12M6 12h12" },
    system: { text: "text-slate-500", bg: "bg-slate-100", d: "M12 8v4l3 2" },
  };
  const s = map[direction] ?? map.system;
  return (
    <span
      className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-black/5",
        s.bg,
        s.text,
      )}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d={s.d} />
      </svg>
    </span>
  );
}
