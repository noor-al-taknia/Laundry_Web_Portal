"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../app/client";
import styles from "./BusinessDayPanel.module.css";

type Day = {
  id: number; businessDate: string; status: "open" | "closed";
  openingCashMinor: number; expectedCashMinor: number; countedCashMinor: number | null; differenceMinor: number | null;
  openedByName: string; closedByName: string | null; openedAt: string; closedAt: string | null; notes: string; version: number;
};
type DayState = { today: string; current: Day | null; todaySession: Day | null; recent: Day[]; total: number; page: number; pageSize: number; canOpen: boolean; canClose: boolean };

/** Shared by office and admin; server permissions remain authoritative. */
export function BusinessDayPanel({ locale = "en", refreshKey, onChange, hideAfterOpening = false }: { locale?: "en" | "ar"; refreshKey?: unknown; onChange?: () => void; hideAfterOpening?: boolean }) {
  const t = (en: string, ar: string) => locale === "ar" ? ar : en;
  const currency = (minor: number) => new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-SA", { style: "currency", currency: "SAR" }).format(minor / 100);
  const [state, setState] = useState<DayState | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<"open" | "close" | null>(null);
  const [cash, setCash] = useState("");
  const [notes, setNotes] = useState("");
  const [closingVersion, setClosingVersion] = useState<number | null>(null);
  const fetchSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++fetchSequence.current;
    try {
      const snapshot = await api<DayState>(`/api/business-day?page=${page}`);
      if (sequence !== fetchSequence.current) return;
      setState(snapshot);
      setDenied(false);
    } catch (caught) {
      if (sequence !== fetchSequence.current) return;
      if (caught instanceof ApiError && caught.status === 403) setDenied(true);
      else setError(caught instanceof Error ? caught.message : "Unable to load business day");
    } finally { if (sequence === fetchSequence.current) setLoading(false); }
  }, [page]);
  useEffect(() => {
    // Fetch the external cash-session snapshot on mount and after parent mutations.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => {
      window.clearInterval(timer);
      // This is a monotonically increasing request token, not a DOM node ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      fetchSequence.current++;
    };
  }, [load, refreshKey]);

  function showForm(action: "open" | "close") {
    setForm(action); setCash(""); setNotes(""); setError(""); setMessage("");
    setClosingVersion(state?.current?.version ?? null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form || pending || !cash.trim()) return;
    setPending(true); setError(""); setMessage("");
    try {
      await api("/api/business-day", { method: "POST", body: JSON.stringify(form === "open"
        ? { action: "open", openingCash: Number(cash) }
        : { action: "close", id: state?.current?.id, version: closingVersion, countedCash: Number(cash), notes }) });
      setForm(null);
      setMessage(form === "open" ? t("Shop day opened. You can now record sales and expenses.", "تم فتح يوم العمل. يمكنك الآن تسجيل المبيعات والمصروفات.") : t("Shop day closed. The cash totals are saved.", "تم إغلاق يوم العمل وحفظ إجمالي النقد."));
      await load(); onChange?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save business day");
      await load();
      // Do not silently accept a new version while the cashier is counting cash.
      setClosingVersion(null);
    } finally { setPending(false); }
  }
  if (denied) return null;
  if (hideAfterOpening && state?.todaySession && !error) return null;
  if (loading) return <section className={styles.panel} aria-busy="true"><div className={styles.skeleton} />{t("Loading shop day…", "جارٍ تحميل يوم العمل…")}</section>;
  const current = state?.current;
  const closedToday = !current && state?.todaySession?.status === "closed";
  return <section className={styles.panel} dir={locale === "ar" ? "rtl" : "ltr"} aria-label={t("Shop day", "يوم العمل")}>
    <div className={styles.header}>
      <div><strong>{t("Shop day", "يوم العمل")} · {current?.businessDate ?? state?.today}</strong><p>{current ? t("Open — shared by all staff", "مفتوح — مشترك بين جميع الموظفين") : closedToday ? t("Closed for today", "مغلق لهذا اليوم") : t("Open the day before recording sales or expenses", "افتح يوم العمل قبل تسجيل المبيعات أو المصروفات")}</p></div>
      <div className={styles.actions}>
        <button type="button" disabled={pending} onClick={() => { setError(""); void load(); }}>{t("Refresh", "تحديث")}</button>
        {current && state?.canClose && <button type="button" disabled={pending} onClick={() => showForm("close")}>{t("Close day", "إغلاق اليوم")}</button>}
        {!current && !closedToday && state?.canOpen && <button type="button" disabled={pending} onClick={() => showForm("open")}>{t("Open day", "فتح اليوم")}</button>}
      </div>
    </div>
    {current && <div className={styles.totals}><span>{t("Opening cash", "النقد الافتتاحي")} <b>{currency(current.openingCashMinor)}</b></span><span>{t("Expected drawer cash", "النقد المتوقع في الصندوق")} <b>{currency(current.expectedCashMinor)}</b></span><span>{t("Opened by", "فتح بواسطة")} <b>{current.openedByName}</b></span></div>}
    {current && current.businessDate !== state?.today && <p className={styles.warning}>{t("A previous day is still open. Close it before opening today's sales.", "لا يزال اليوم السابق مفتوحاً. أغلقه قبل فتح مبيعات اليوم.")}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {form && <form className={styles.form} onSubmit={submit}>
      <label>{form === "open" ? t("Opening drawer cash (SAR)", "النقد الافتتاحي في الصندوق (ريال)") : t("Actual cash counted (SAR)", "النقد المعدود فعلياً (ريال)")}<input type="number" inputMode="decimal" min="0" max="99999999" step="0.01" required value={cash} onChange={(event) => setCash(event.target.value)} /></label>
      {form === "close" && <label>{t("Closing notes", "ملاحظات الإغلاق")}<input value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} /></label>}
      {form === "close" && current && <p>{t("Expected", "المتوقع")}: {currency(current.expectedCashMinor)} · {t("Difference", "الفرق")}: {currency((Math.round(Number(cash || 0) * 100)) - current.expectedCashMinor)}<br />{t("Closing locks these totals. Finish all staff transactions first.", "الإغلاق يقفل هذه الإجماليات. أنهِ معاملات جميع الموظفين أولاً.")}</p>}
      {form === "close" && closingVersion === null && <button type="button" disabled={pending} onClick={() => { setClosingVersion(current?.version ?? null); setCash(""); setError(""); }}>{t("Recount using refreshed totals", "أعد العد باستخدام الإجماليات المحدثة")}</button>}
      <div className={styles.actions}><button type="button" disabled={pending} onClick={() => setForm(null)}>{t("Cancel", "إلغاء")}</button><button type="submit" disabled={pending || (form === "close" && closingVersion === null)}>{pending ? t("Saving…", "جارٍ الحفظ…") : form === "open" ? t("Confirm opening", "تأكيد الفتح") : t("Confirm closing", "تأكيد الإغلاق")}</button></div>
    </form>}
    <details className={styles.history}><summary>{t("Previous closing records", "سجلات الإغلاق السابقة")}</summary>
      <div className={styles.historyList}>{state?.recent.map((day) => <article key={day.id}><strong>{day.businessDate}</strong><span>{t("Expected", "المتوقع")}: {currency(day.expectedCashMinor)}</span><span>{t("Counted", "المعدود")}: {currency(day.countedCashMinor ?? 0)}</span><span>{t("Difference", "الفرق")}: {currency(day.differenceMinor ?? 0)}</span><small>{t("Closed by", "أغلق بواسطة")} {day.closedByName}{day.notes ? ` · ${day.notes}` : ""}</small></article>)}</div>
      {!state?.recent.length && <p>{t("No closed days yet.", "لا توجد أيام مغلقة بعد.")}</p>}
      {(state?.total ?? 0) > 10 && <div className={styles.actions}><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>{t("Previous", "السابق")}</button><span>{page} / {Math.ceil((state?.total ?? 0) / 10)}</span><button type="button" disabled={page * 10 >= (state?.total ?? 0)} onClick={() => setPage(page + 1)}>{t("Next", "التالي")}</button></div>}
    </details>
  </section>;
}
