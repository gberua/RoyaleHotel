"use client";
/** Admin UI kit: forms with translated validation errors, localized (KA/EN/RU) inputs, toggles, confirm buttons. */
import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";

export type ActionResult = { ok: true; message?: string; values?: Record<string, string | number>; data?: unknown } | { ok: false; error: string; fieldErrors?: Record<string, string>; values?: Record<string, string | number> };
type FormAction = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

const secretOf = (r: ActionResult) => (r.ok ? (r.data as { password?: string } | undefined)?.password : undefined);

const ErrorsCtx = createContext<Record<string, string>>({});
export const useFieldError = (name: string) => useContext(ErrorsCtx)[name];

export function useErrorText() {
  const t = useTranslations("admin.errors");
  return (key: string, values?: Record<string, string | number>) => (t.has(key) ? t(key, values) : key.startsWith("booking_") && t.has("booking") ? t("booking") : t("unexpected"));
}

export function AdminForm({ action, children, submit, className = "", tone = "primary", onDone, resetOnSuccess = false, confirm, submitClassName = "" }: {
  action: FormAction; children?: ReactNode; submit?: string; className?: string; tone?: "primary" | "ghost" | "danger"; onDone?: (r: ActionResult) => void; resetOnSuccess?: boolean; confirm?: string; submitClassName?: string;
}) {
  const t = useTranslations("admin.common");
  const errText = useErrorText();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, { ok: true });
  const ref = useRef<HTMLFormElement>(null);
  const [shown, setShown] = useState<ActionResult | null>(null);
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    setShown(state);
    if (state.ok && resetOnSuccess) ref.current?.reset();
    onDone?.(state);
    if (state.ok && secretOf(state)) return; // a one-time password stays visible until the page changes
    const id = setTimeout(() => setShown((s) => (s === state && state.ok ? null : s)), 4000);
    return () => clearTimeout(id);
  }, [state, resetOnSuccess, onDone]);
  const btn = tone === "danger" ? "btn !min-h-10 bg-danger text-white hover:bg-red-800" : tone === "ghost" ? "btn btn-ghost !min-h-10" : "btn btn-primary !min-h-10";
  return (
    <ErrorsCtx.Provider value={!state.ok ? state.fieldErrors ?? {} : {}}>
      <form ref={ref} action={formAction} className={className} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} noValidate>
        {children}
        {(submit || shown) && (
          <div className="col-span-full mt-3 flex flex-wrap items-center gap-3">
            {submit && <button className={`${btn} text-sm ${submitClassName}`} disabled={pending}>{pending && <Loader2 size={15} className="animate-spin" aria-hidden />}{submit}</button>}
            {shown?.ok && secretOf(shown) && (
              <span className="w-full rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
                {t("oneTimePassword")} <code className="ml-1 select-all rounded bg-white px-2 py-1 font-mono text-base font-semibold" data-testid="one-time-password">{secretOf(shown)}</code>
              </span>
            )}
            {shown && (
              <span role="status" className={`flex items-center gap-1 text-sm ${shown.ok ? "text-success" : "text-danger"}`}>
                {shown.ok ? <><Check size={15} aria-hidden /> {shown.message ? (t.has(shown.message) ? t(shown.message, shown.values) : shown.message) : t("saved")}</> : errText(shown.error, shown.values)}
              </span>
            )}
          </div>
        )}
      </form>
    </ErrorsCtx.Provider>
  );
}

const fieldCls = "field !min-h-10 !py-1.5 text-sm";

export function Field({ label, name, hint, children, className = "" }: { label: string; name?: string; hint?: string; children: ReactNode; className?: string }) {
  const err = useFieldError(name ?? "");
  const errText = useErrorText();
  return (
    <label className={`block text-xs font-medium text-ink-700 ${className}`}>
      <span className="mb-1 block">{label}</span>
      {children}
      {hint && !err && <span className="mt-1 block font-normal text-ink-500">{hint}</span>}
      {err && <span className="mt-1 block font-normal text-danger" role="alert">{errText(err)}</span>}
    </label>
  );
}

export function TextInput({ label, name, defaultValue, type = "text", hint, required, placeholder, className = "", inputMode, step, min, max }: {
  label: string; name: string; defaultValue?: string | number | null; type?: string; hint?: string; required?: boolean; placeholder?: string; className?: string; inputMode?: "decimal" | "numeric" | "email" | "tel"; step?: string; min?: string | number; max?: string | number;
}) {
  const err = useFieldError(name);
  return (
    <Field label={`${label}${required ? " *" : ""}`} name={name} hint={hint} className={className}>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} inputMode={inputMode} step={step} min={min} max={max} aria-invalid={!!err} className={`${fieldCls} ${err ? "!border-danger" : ""}`} />
    </Field>
  );
}

export function SelectInput({ label, name, defaultValue, options, hint, className = "", onChange }: { label: string; name: string; defaultValue?: string; options: { value: string; label: string }[]; hint?: string; className?: string; onChange?: (v: string) => void }) {
  return (
    <Field label={label} name={name} hint={hint} className={className}>
      <select name={name} defaultValue={defaultValue} onChange={(e) => onChange?.(e.target.value)} className={fieldCls}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Toggle({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-ink-100 transition-colors peer-checked:bg-sea-600 peer-focus-visible:ring-2 peer-focus-visible:ring-sea-600 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" aria-hidden />
      <span><span className="font-medium text-ink-900">{label}</span>{hint && <span className="block text-xs text-ink-500">{hint}</span>}</span>
    </label>
  );
}

const LANGS = [["ka", "ქართ"], ["en", "EN"], ["ru", "RU"]] as const;

/** One field in three languages, shown as tabs. Inputs are named `${name}.ka` / `.en` / `.ru`. */
export function LocalizedInput({ label, name, value, multiline = false, rows = 3, required = false, hint }: { label: string; name: string; value?: Record<string, string> | null; multiline?: boolean; rows?: number; required?: boolean; hint?: string }) {
  const [tab, setTab] = useState<"ka" | "en" | "ru">("ka");
  const [filled, setFilled] = useState(() => Object.fromEntries(LANGS.map(([l]) => [l, !!value?.[l]?.trim()])));
  const errKa = useFieldError(`${name}.ka`);
  const errText = useErrorText();
  return (
    <div className="text-xs font-medium text-ink-700">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span>{label}{required ? " *" : ""}</span>
        <span className="flex overflow-hidden rounded-lg border border-ink-100" role="tablist">
          {LANGS.map(([l, short]) => (
            <button key={l} type="button" role="tab" aria-selected={tab === l} onClick={() => setTab(l)} className={`flex items-center gap-1 px-2 py-0.5 text-[0.7rem] font-semibold ${tab === l ? "bg-ink-900 text-white" : "bg-white text-ink-700"}`}>
              {short}<span className={`h-1.5 w-1.5 rounded-full ${filled[l] ? "bg-success" : "bg-amber-400"}`} aria-hidden />
            </button>
          ))}
        </span>
      </div>
      {LANGS.map(([l]) => {
        const common = { name: `${name}.${l}`, defaultValue: value?.[l] ?? "", lang: l, onChange: (e: { target: { value: string } }) => setFilled((f) => ({ ...f, [l]: !!e.target.value.trim() })), className: `${fieldCls} ${tab === l ? "" : "hidden"} ${errKa && l === "ka" ? "!border-danger" : ""}` };
        return multiline ? <textarea key={l} rows={rows} {...common} className={`${common.className} resize-y`} /> : <input key={l} {...common} />;
      })}
      {hint && <span className="mt-1 block font-normal text-ink-500">{hint}</span>}
      {errKa && <span className="mt-1 block font-normal text-danger" role="alert">{errText(errKa)}</span>}
    </div>
  );
}

/** Small danger button for a plain form action (no result message) that asks before it runs. */
export function ConfirmSubmit({ action, id, label, confirm }: { action: (form: FormData) => Promise<void>; id: string; label: string; confirm: string }) {
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-ghost !min-h-8 !px-3 text-xs text-danger">{label}</button>
    </form>
  );
}

/** Button that runs a server action after a confirmation, showing the result. */
export function ActionButton({ action, fields, label, confirm, tone = "ghost", className = "" }: { action: FormAction; fields: Record<string, string>; label: string; confirm?: string; tone?: "primary" | "ghost" | "danger"; className?: string }) {
  return (
    <AdminForm action={action} submit={label} confirm={confirm} tone={tone} className={className}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </AdminForm>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-4 ring-1 ring-ink-100 sm:p-5 ${className}`}>
      {(title || actions) && <div className="mb-3 flex flex-wrap items-center justify-between gap-2">{title && <h2 className="font-sans text-base font-semibold">{title}</h2>}{actions}</div>}
      {children}
    </section>
  );
}
