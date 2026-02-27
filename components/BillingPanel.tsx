"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaCheckCircle,
  FaChevronDown,
  FaClock,
  FaCopy,
  FaEye,
  FaEyeSlash,
  FaFileInvoiceDollar,
  FaPaperclip,
  FaQrcode,
  FaTimesCircle,
  FaUpload,
} from "react-icons/fa";

import Button from "@/components/Button";
import { useToast } from "@/components/ToastProvider";
import { PRICING_PLANS } from "@/lib/pricing-plans";

type BillingInvoiceItem = {
  id: string;
  plan: "FREE" | "PAID" | "RESELLER";
  amount: number;
  currency: string;
  status: "UNPAID" | "PAID" | "EXPIRED" | "CANCELED";
  periodStart: string;
  periodEnd: string;
  paymentMethod: string | null;
  paymentProofUrl: string | null;
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  awaitingReview: boolean;
};

type BillingPanelProps = {
  currentPlan: "FREE" | "PAID" | "RESELLER";
  invoices: BillingInvoiceItem[];
  initialPlan: "PAID" | "RESELLER";
};

type PaymentMethodId = "QRIS" | "GO-PAY" | "Shopee-Pay" | "DANA";
type PaymentMethodOption = {
  id: PaymentMethodId;
  label: string;
  logoPath: string;
  kind: "qris" | "wallet";
};

const PLAN_PRICE_LABEL: Record<"PAID" | "RESELLER", string> = {
  PAID: "Rp. 5.000",
  RESELLER: "Rp. 15.000",
};

const planRank: Record<"FREE" | "PAID" | "RESELLER", number> = {
  FREE: 0,
  PAID: 1,
  RESELLER: 2,
};

const statusBadgeClass: Record<BillingInvoiceItem["status"], string> = {
  UNPAID: "bg-amber-500/15 text-amber-500",
  PAID: "bg-emerald-500/15 text-emerald-500",
  EXPIRED: "bg-zinc-500/15 text-zinc-400",
  CANCELED: "bg-red-500/15 text-red-400",
};

const QRIS_IMAGE_PATH = "/payment/QRIS/JzQRIS.jpg";
const ACCOUNT_OWNER_NAME = "Raihan Hariyanto Putra";
const WALLET_PHONE = "085956640569";
const maskedPhoneLabel = "08••••••0569";

const PAYMENT_METHOD_OPTIONS: PaymentMethodOption[] = [
  {
    id: "QRIS",
    label: "QRIS",
    logoPath: "/payment/methods/qris.svg",
    kind: "qris",
  },
  {
    id: "GO-PAY",
    label: "GO-PAY",
    logoPath: "/payment/methods/gopay.svg",
    kind: "wallet",
  },
  {
    id: "Shopee-Pay",
    label: "Shopee-Pay",
    logoPath: "/payment/methods/shopeepay.svg",
    kind: "wallet",
  },
  {
    id: "DANA",
    label: "DANA",
    logoPath: "/payment/methods/dana.svg",
    kind: "wallet",
  },
];

type PaymentMethodDropdownProps = {
  value: PaymentMethodId;
  onChange: (next: PaymentMethodId) => void;
  label: string;
  compact?: boolean;
};

function PaymentMethodDropdown({
  value,
  onChange,
  label,
  compact = false,
}: PaymentMethodDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedMethod =
    PAYMENT_METHOD_OPTIONS.find((option) => option.id === value) || PAYMENT_METHOD_OPTIONS[0];

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <p className={compact ? "mb-1 text-[11px] text-zinc-500" : "mb-1.5 text-xs text-zinc-500"}>{label}</p>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={[
          "flex w-full items-center justify-between rounded-lg border border-zinc-300 bg-white px-3",
          "text-left text-zinc-900 transition-colors hover:bg-zinc-100",
          "dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900",
          compact ? "h-10 text-sm" : "h-11 text-sm",
        ].join(" ")}
      >
        <span className="inline-flex items-center gap-2">
          <img
            src={selectedMethod.logoPath}
            alt={`${selectedMethod.label} logo`}
            className="h-5 w-5 rounded-sm object-contain"
            loading="lazy"
          />
          <span className="font-medium">{selectedMethod.label}</span>
        </span>
        <FaChevronDown className={`text-xs text-zinc-500 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen ? (
        <div className="absolute z-20 mt-2 w-full rounded-lg border border-zinc-300 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
          {PAYMENT_METHOD_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onChange(option.id);
                setIsOpen(false);
              }}
              className={[
                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                option.id === value
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
              ].join(" ")}
            >
              <img
                src={option.logoPath}
                alt={`${option.label} logo`}
                className="h-5 w-5 rounded-sm object-contain"
                loading="lazy"
              />
              <span className="font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function BillingPanel({ currentPlan, invoices, initialPlan }: BillingPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<"PAID" | "RESELLER">(initialPlan);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const [submitInvoiceId, setSubmitInvoiceId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("QRIS");
  const [isPhoneVisible, setIsPhoneVisible] = useState(false);
  const [note, setNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [cancelLoadingId, setCancelLoadingId] = useState<string | null>(null);

  const sortedInvoices = useMemo(
    () =>
      [...invoices].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [invoices],
  );

  const pendingInvoiceForPlan = sortedInvoices.find(
    (invoice) => invoice.status === "UNPAID" && invoice.plan === selectedPlan,
  );
  const unpaidInvoices = sortedInvoices.filter((invoice) => invoice.status === "UNPAID");
  const latestUnpaidInvoice = unpaidInvoices[0] || null;

  const selectedPaymentMethod =
    PAYMENT_METHOD_OPTIONS.find((option) => option.id === paymentMethod) || PAYMENT_METHOD_OPTIONS[0];
  const isWalletPayment = selectedPaymentMethod.kind === "wallet";

  useEffect(() => {
    setIsPhoneVisible(false);
  }, [paymentMethod]);

  const copyWalletPhone = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard) {
        throw new Error("Clipboard is not available.");
      }
      await navigator.clipboard.writeText(WALLET_PHONE);
      toast.success("Nomor berhasil disalin.", "Copied");
    } catch {
      toast.error("Gagal menyalin nomor.", "Copy failed");
    }
  };

  const createInvoice = async () => {
    if (planRank[currentPlan] >= planRank[selectedPlan]) {
      toast.warning("Plan ini sudah kamu miliki.", "Purchase blocked");
      return;
    }

    setCreatingInvoice(true);

    try {
      const response = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        toast.error(data.error || "Failed to create invoice.", "Create failed");
        setCreatingInvoice(false);
        return;
      }

      toast.success(data.message || "Invoice created.", "Billing");
      router.refresh();
    } catch {
      toast.error("Network error while creating invoice.", "Create failed");
    } finally {
      setCreatingInvoice(false);
    }
  };

  const openSubmitDialog = (invoiceId: string) => {
    setSubmitInvoiceId(invoiceId);
    setNote("");
    setProofFile(null);
  };

  const closeSubmitDialog = () => {
    setSubmitInvoiceId(null);
    setProofFile(null);
    setNote("");
  };

  const submitProof = async () => {
    if (!submitInvoiceId) {
      return;
    }

    if (!proofFile) {
      toast.warning("Pilih file bukti pembayaran dulu.", "Validation");
      return;
    }

    const formData = new FormData();
    formData.append("paymentProof", proofFile);
    formData.append("paymentMethod", paymentMethod);
    formData.append("note", note);

    setSubmitLoading(true);

    try {
      const response = await fetch(`/api/billing/invoices/${submitInvoiceId}/submit`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        toast.error(data.error || "Failed to submit payment proof.", "Submit failed");
        setSubmitLoading(false);
        return;
      }

      toast.success(data.message || "Payment proof submitted.", "Billing");
      closeSubmitDialog();
      router.refresh();
    } catch {
      toast.error("Network error while submitting payment proof.", "Submit failed");
    } finally {
      setSubmitLoading(false);
    }
  };

  const cancelInvoice = async (invoiceId: string) => {
    setCancelLoadingId(invoiceId);
    try {
      const response = await fetch(`/api/billing/invoices/${invoiceId}/cancel`, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        toast.error(data.error || "Failed to cancel invoice.", "Cancel failed");
        setCancelLoadingId(null);
        return;
      }
      toast.success(data.message || "Invoice canceled.", "Billing");
      router.refresh();
    } catch {
      toast.error("Network error while canceling invoice.", "Cancel failed");
    } finally {
      setCancelLoadingId(null);
    }
  };

  const paidPlanCard = PRICING_PLANS.filter(
    (plan) => plan.name === "PAID" || plan.name === "RESELLER",
  ) as Array<(typeof PRICING_PLANS)[number] & { name: "PAID" | "RESELLER" }>;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Purchase Plan (Manual)</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Buat invoice manual, upload bukti pembayaran, lalu tunggu verifikasi superadmin.
            </p>
          </div>
          <span className="inline-flex rounded-full border border-zinc-700/70 bg-zinc-800/70 px-2.5 py-1 text-xs font-semibold text-zinc-100">
            Current Plan: {currentPlan}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {paidPlanCard.map((plan) => {
            const owned = planRank[currentPlan] >= planRank[plan.name];
            const selected = selectedPlan === plan.name;
            return (
              <article
                key={plan.name}
                className={[
                  "rounded-xl border p-4 transition-colors",
                  selected ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-300 dark:border-zinc-700",
                  "bg-zinc-50 dark:bg-zinc-950/50",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-zinc-500">{plan.name}</p>
                    <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                      {PLAN_PRICE_LABEL[plan.name]}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500">{plan.description}</p>
                  </div>
                  {owned ? (
                    <span className="inline-flex rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                      Owned
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={selected ? "secondary" : "ghost"}
                    className="h-9 px-3 text-xs"
                    disabled={owned}
                    onClick={() => setSelectedPlan(plan.name)}
                  >
                    {selected ? "Selected" : "Select"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={createInvoice}
            isLoading={creatingInvoice}
            loadingText="Creating..."
            disabled={planRank[currentPlan] >= planRank[selectedPlan]}
          >
            <span className="inline-flex items-center gap-2">
              <FaFileInvoiceDollar className="text-xs" />
              Create {selectedPlan} Invoice
            </span>
          </Button>
          {pendingInvoiceForPlan ? (
            <span className="text-xs text-amber-500">
              Kamu masih punya invoice UNPAID untuk {selectedPlan}: {pendingInvoiceForPlan.id}
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Manual Payment Instructions</h3>
        {latestUnpaidInvoice ? (
          <>
            <p className="mt-1 text-xs text-zinc-500">
              Invoice aktif:{" "}
              <span className="font-semibold text-zinc-700 dark:text-zinc-200">{latestUnpaidInvoice.id}</span> |{" "}
              {latestUnpaidInvoice.currency} {formatNumber(latestUnpaidInvoice.amount)}
            </p>
            <ol className="mt-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
              <li>1. Bayar sesuai nominal invoice UNPAID.</li>
              <li>2. Pilih metode pembayaran di bawah (QRIS / e-wallet).</li>
              <li>3. Upload bukti pembayaran pada invoice tersebut.</li>
              <li>4. Superadmin review lalu plan akan aktif otomatis jika valid.</li>
            </ol>

            <div className="mt-4 max-w-sm">
              <PaymentMethodDropdown
                label="Payment method"
                value={paymentMethod}
                onChange={(next) => setPaymentMethod(next)}
              />
            </div>

            {selectedPaymentMethod.kind === "qris" ? (
              <article className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/50">
                <div className="flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    <img
                      src={selectedPaymentMethod.logoPath}
                      alt="QRIS logo"
                      className="h-5 w-5 rounded-sm object-contain"
                      loading="lazy"
                    />
                    QRIS Payment
                  </p>
                  <a
                    href={QRIS_IMAGE_PATH}
                    download="JzRESTAPI-QRIS.jpg"
                    className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Download QRIS
                  </a>
                </div>
                <img
                  src={QRIS_IMAGE_PATH}
                  alt="QRIS JzUVDev Store"
                  className="mt-3 max-h-96 w-full rounded-lg border border-zinc-300 object-contain dark:border-zinc-700"
                  loading="lazy"
                />
                <p className="mt-2 text-xs text-zinc-500">Scan QRIS di atas, lalu upload bukti pembayaran di invoice.</p>
              </article>
            ) : (
              <article className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/50">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  <img
                    src={selectedPaymentMethod.logoPath}
                    alt={`${selectedPaymentMethod.label} logo`}
                    className="h-5 w-5 rounded-sm object-contain"
                    loading="lazy"
                  />
                  {selectedPaymentMethod.label} Transfer
                </p>
                <p className="mt-1 text-xs text-zinc-500">Atas nama: {ACCOUNT_OWNER_NAME}</p>
                <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">Nomor tujuan</p>
                  <p className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-100">
                    {isPhoneVisible ? WALLET_PHONE : maskedPhoneLabel}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={() => setIsPhoneVisible((visible) => !visible)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {isPhoneVisible ? <FaEyeSlash className="text-[10px]" /> : <FaEye className="text-[10px]" />}
                        {isPhoneVisible ? "Hide" : "Lihat"}
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-2 text-xs"
                      onClick={() => void copyWalletPhone()}
                    >
                      <span className="inline-flex items-center gap-1">
                        <FaCopy className="text-[10px]" />
                        Copy
                      </span>
                    </Button>
                  </div>
                </div>
              </article>
            )}
          </>
        ) : (
          <article className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/50">
            Buat invoice dulu. Detail pembayaran akan muncul setelah ada invoice <span className="font-semibold">UNPAID</span>.
          </article>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800/80 dark:bg-zinc-900/70">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">My Invoices</h3>
        <p className="mt-1 text-sm text-zinc-500">Riwayat invoice dan status verifikasi pembayaran.</p>

        <div className="mt-4 space-y-3">
          {sortedInvoices.length === 0 ? (
            <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/50">
              Belum ada invoice.
            </article>
          ) : (
            sortedInvoices.map((invoice) => (
              <article
                key={invoice.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-950/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{invoice.id}</p>
                    <p className="text-xs text-zinc-500">
                      {invoice.plan} | {invoice.currency} {formatNumber(invoice.amount)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">Created: {formatDateTime(invoice.createdAt)}</p>
                  </div>
                  <span
                    className={[
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      statusBadgeClass[invoice.status],
                    ].join(" ")}
                  >
                    {invoice.awaitingReview ? "AWAITING_REVIEW" : invoice.status}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 text-xs text-zinc-500 md:grid-cols-2">
                  <p>
                    Period: {formatDateTime(invoice.periodStart)} - {formatDateTime(invoice.periodEnd)}
                  </p>
                  <p>Method: {invoice.paymentMethod || "-"}</p>
                  {invoice.paymentProofUrl ? (
                    <a
                      href={invoice.paymentProofUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-100"
                    >
                      <FaPaperclip className="text-[10px]" />
                      View proof
                    </a>
                  ) : (
                    <p>Payment proof: -</p>
                  )}
                </div>

                {invoice.notes ? (
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-zinc-100 p-2 text-[11px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    {invoice.notes}
                  </pre>
                ) : null}

                {invoice.status === "UNPAID" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" className="h-8 px-3 text-xs" onClick={() => openSubmitDialog(invoice.id)}>
                      <span className="inline-flex items-center gap-2">
                        <FaUpload className="text-[10px]" />
                        Submit Proof
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 border border-red-300 px-3 text-xs text-red-500 hover:bg-red-100 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                      onClick={() => void cancelInvoice(invoice.id)}
                      isLoading={cancelLoadingId === invoice.id}
                      loadingText="Canceling..."
                    >
                      <span className="inline-flex items-center gap-2">
                        <FaTimesCircle className="text-[10px]" />
                        Cancel Invoice
                      </span>
                    </Button>
                  </div>
                ) : invoice.status === "PAID" ? (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-2 py-1 text-xs text-emerald-500">
                    <FaCheckCircle className="text-[10px]" />
                    Payment approved.
                  </p>
                ) : (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-zinc-500/10 px-2 py-1 text-xs text-zinc-400">
                    <FaClock className="text-[10px]" />
                    Invoice closed.
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      </section>

      {submitInvoiceId ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <h4 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Submit Payment Proof</h4>
            <p className="mt-1 text-xs text-zinc-500">Invoice: {submitInvoiceId}</p>

            <div className="mt-4 space-y-3">
              <PaymentMethodDropdown
                compact
                label="Payment method"
                value={paymentMethod}
                onChange={(next) => setPaymentMethod(next)}
              />

              {isWalletPayment ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/60">
                  <p>
                    Metode dipilih: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{paymentMethod}</span>
                  </p>
                  <p className="mt-1">Nomor tujuan: {isPhoneVisible ? WALLET_PHONE : maskedPhoneLabel}</p>
                </div>
              ) : (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950/60">
                  <p>Metode dipilih: <span className="font-semibold text-zinc-700 dark:text-zinc-200">QRIS</span></p>
                  <p className="mt-1">Silakan scan QRIS pada panel payment instructions.</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500">Note (optional)</label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                  placeholder="Tambahkan catatan pembayaran jika perlu"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-500">Payment proof image (JPG/PNG/WEBP max 4MB)</label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="secondary" className="h-9 px-3 text-xs" onClick={() => fileInputRef.current?.click()}>
                    Choose file
                  </Button>
                  <span className="text-xs text-zinc-500">{proofFile ? proofFile.name : "No file selected"}</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeSubmitDialog}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitProof}
                isLoading={submitLoading}
                loadingText="Submitting..."
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
