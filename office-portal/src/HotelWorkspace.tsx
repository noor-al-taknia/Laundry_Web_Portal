"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../app/client";
import type { BootstrapData, CartItem } from "../../contracts/src";
import type { HotelCustomer, HotelDelivery, HotelInvoice } from "../../contracts/src/hotels";
import { hotelDraftTotals } from "./hotel-totals";
import { hotelRequestKey, useHotelStore } from "./hotel-store";
import "./hotel-workspace.css";

type Locale = "en" | "ar";
const tr = (locale: Locale, en: string, ar: string) => locale === "ar" ? ar : en;
const money = (amount: number) => `SAR ${Number(amount).toFixed(2)}`;
const today = () => new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 10);
type Props = { data: BootstrapData; locale: Locale; onChanged: () => Promise<void>; onPrintInvoice: (invoice: HotelInvoice) => void; toolbar?: React.ReactNode };

export default function HotelWorkspace({ data, locale, onChanged, onPrintInvoice, toolbar }: Props) {
  const draft = useHotelStore();
  const [search, setSearch] = useState("");
  const [showHotelResults, setShowHotelResults] = useState(!draft.hotel);
  const [recordSearch, setRecordSearch] = useState("");
  const [hotels, setHotels] = useState<HotelCustomer[]>([]);
  const [hotelCatalog, setHotelCatalog] = useState<BootstrapData["catalog"]>([]);
  const [hotelTotal, setHotelTotal] = useState(0);
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [tab, setTab] = useState<"deliveries" | "invoices" | "directory">("deliveries");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [assignedStaffId, setAssignedStaffId] = useState(data.user.role === "staff" ? data.user.id : data.staffUsers[0]?.id ?? 0);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [deliveries, setDeliveries] = useState<HotelDelivery[]>([]);
  const [invoices, setInvoices] = useState<HotelInvoice[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ sales: 0, collected: 0, balance: 0 });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [selectedDelivery, setSelectedDelivery] = useState<HotelDelivery | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<HotelInvoice | null>(null);
  const [directoryEdit, setDirectoryEdit] = useState<HotelCustomer | "new" | null>(null);
  const hotelId = draft.ownerId === data.user.id ? draft.hotel?.id : undefined;
  const allowed = (operation: string) => data.user.role === "admin" || data.staffAccess?.capabilities[operation] !== false;
  const categories = (hotelId ? hotelCatalog : []).filter((category) => category.isActive);
  const category = categories.find((entry) => entry.id === categoryId) ?? categories[0];
  const totals = useMemo(() => hotelDraftTotals(draft.cart), [draft.cart]);

  useEffect(() => { useHotelStore.getState().bindUser(data.user.id); }, [data.user.id]);

  useEffect(() => {
    if (!error && !notice) return;
    const timeout = window.setTimeout(() => { setError(""); setNotice(""); }, 3000);
    return () => window.clearTimeout(timeout);
  }, [error, notice]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setDirectoryLoading(true);
      try {
        const result = await api<{ hotels: HotelCustomer[]; total: number }>(`/api/hotels?search=${encodeURIComponent(search)}&page=${directoryPage}&pageSize=10&includeInactive=${tab === "directory" ? "1" : "0"}`, { signal: controller.signal });
        setHotels(result.hotels); setHotelTotal(result.total);
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Hotel search failed"); }
      finally { if (!controller.signal.aborted) setDirectoryLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, directoryPage, reload, tab, data.user.id]);

  useEffect(() => {
    if (!hotelId) return;
    const controller = new AbortController();
    void api<{ catalog: BootstrapData["catalog"] }>(`/api/hotel-catalog?hotelId=${hotelId}`, { signal: controller.signal })
      .then((result) => { setHotelCatalog(result.catalog); setCategoryId((current) => result.catalog.some((entry) => entry.id === current) ? current : result.catalog[0]?.id ?? null); })
      .catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load this hotel’s price list"); });
    return () => controller.abort();
  }, [hotelId]);

  useEffect(() => {
    if (!hotelId || tab === "directory") return;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const query = new URLSearchParams({ hotelId: String(hotelId), month, page: String(page), pageSize: "10", search: recordSearch });
        if (tab === "deliveries") {
          const result = await api<{ deliveries: HotelDelivery[]; total: number }>(`/api/hotel-deliveries?${query}`, { signal: controller.signal });
          setDeliveries(result.deliveries); setTotal(result.total);
        } else {
          const result = await api<{ invoices: HotelInvoice[]; total: number; summary: typeof summary }>(`/api/hotel-invoices?${query}`, { signal: controller.signal });
          setInvoices(result.invoices); setTotal(result.total); setSummary(result.summary);
        }
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load hotel records"); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [hotelId, month, page, tab, reload, recordSearch, data.user.id]);

  function chooseHotel(hotel: HotelCustomer) {
    if (!hotel.isActive) return;
    if (draft.hotel?.id !== hotel.id && draft.cart.length && !window.confirm(tr(locale, "Changing the hotel clears this unsaved delivery. Continue?", "تغيير الفندق يمسح التسليم غير المحفوظ. هل تريد المتابعة؟"))) return;
    draft.selectHotel(hotel); setShowHotelResults(false); setPage(1); setSelectedDelivery(null); setSelectedInvoice(null); setDeliveries([]); setInvoices([]); setTotal(0); setNotice("");
  }

  async function changed() { setReload((value) => value + 1); await onChanged(); }

  async function saveDelivery(print = false) {
    if (!hotelId || !draft.cart.length || !assignedStaffId) return setError(tr(locale,"Select a hotel, staff member, and at least one service.","اختر فندقاً وموظفاً وخدمة واحدة على الأقل."));
    setBusy(true); setError("");
    try {
      const result = await api<{ delivery: HotelDelivery }>("/api/hotel-deliveries", { method: "POST", body: JSON.stringify({ requestKey: draft.requestKey, hotelId, assignedStaffId, deliveryDate, notes: draft.notes, items: draft.cart.map(({ serviceId, quantity, unitPrice }) => ({ serviceId, quantity, unitPrice })) }) });
      draft.resetDelivery(); setMonth(deliveryDate.slice(0, 7)); setPage(1); setReload(value => value + 1);
      setNotice(tr(locale, `Delivery ${result.delivery.token} saved. Issuing its invoice…`, `تم حفظ التسليم ${result.delivery.token}. جارٍ إصدار الفاتورة…`));
      const issued = await api<{ invoice: HotelInvoice }>("/api/hotel-invoices", { method: "POST", body: JSON.stringify({ deliveryId: result.delivery.id }) });
      setNotice(tr(locale, `Invoice ${issued.invoice.invoiceNumber} saved.`, `تم حفظ الفاتورة ${issued.invoice.invoiceNumber}.`));
      if (print) onPrintInvoice(issued.invoice);
      await changed();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Invoice could not be completed. If the delivery was saved, use Issue invoice in its record below."); }
    finally { setBusy(false); }
  }

  async function openDelivery(id: number) {
    setBusy(true); setError("");
    try { const result = await api<{ delivery: HotelDelivery }>(`/api/hotel-deliveries?id=${id}`); setSelectedDelivery(result.delivery); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load delivery"); }
    finally { setBusy(false); }
  }

  async function openInvoice(id: number) {
    setBusy(true); setError("");
    try { const result = await api<{ invoice: HotelInvoice }>(`/api/hotel-invoices?id=${id}`); setSelectedInvoice(result.invoice); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load invoice"); }
    finally { setBusy(false); }
  }

  async function issueInvoice(deliveryId: number) {
    setBusy(true); setError("");
    try {
      const result = await api<{ invoice: HotelInvoice }>("/api/hotel-invoices", { method: "POST", body: JSON.stringify({ deliveryId }) });
      setSelectedInvoice(result.invoice); setTab("invoices"); setPage(1); await changed();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Invoice could not be issued"); }
    finally { setBusy(false); }
  }

  return <section className="hotel-workspace" dir={locale === "ar" ? "rtl" : "ltr"}>
    <header className="hotel-heading"><div><span className="hotel-tag">{tr(locale,"HOTELS","الفنادق")}</span><h2>{tr(locale,"Hotel billing","فواتير الفنادق")}</h2><p>{tr(locale,"Separate hotel accounts. Walk-in orders and collections are not shown here.","حسابات مستقلة للفنادق. لا تظهر هنا طلبات وتحصيلات العملاء المباشرين.")}</p></div>{toolbar}</header>
    {error && <div className="hotel-notice error" role="alert">{error}<button onClick={() => setError("")} aria-label={tr(locale,"Dismiss","إغلاق")}>×</button></div>}
    {notice && <div className="hotel-success-modal" role="status"><strong>{tr(locale,"Saved successfully","تم الحفظ بنجاح")}</strong><span>{notice}</span></div>}
    <div className="hotel-selector"><label>{tr(locale,"Find hotel by code or name","ابحث عن الفندق بالرمز أو الاسم")}<input value={search} onFocus={() => setShowHotelResults(true)} onChange={(event) => { setSearch(event.target.value); setDirectoryPage(1); setShowHotelResults(true); }} placeholder={tr(locale,"Enter hotel code…","أدخل رمز الفندق…")} /></label>
      {showHotelResults && tab !== "directory" && <div className="hotel-search-results" aria-busy={directoryLoading}>{directoryLoading ? <LoadingRows /> : hotels.filter((hotel) => hotel.isActive).map((hotel) => <button type="button" key={hotel.id} aria-pressed={hotel.id === hotelId} onClick={() => chooseHotel(hotel)}><b>{hotel.code}</b><span>{hotel.name}</span></button>)}</div>}
      {showHotelResults && !directoryLoading && !hotels.length && <p>{tr(locale,"No hotel found. Ask the administrator to add it to the hotel directory.","لم يُعثر على الفندق. اطلب من الإدارة إضافته إلى دليل الفنادق.")}</p>}
      {(showHotelResults || tab === "directory") && <Pagination page={directoryPage} total={hotelTotal} onPage={setDirectoryPage} locale={locale} />}
    </div>
    {draft.ownerId === data.user.id && draft.hotel && <div className="hotel-selected"><strong>{draft.hotel.code} · {draft.hotel.name}</strong><span>{draft.hotel.address}</span><small>{tr(locale,"VAT number","الرقم الضريبي")}: {draft.hotel.vatNumber || "—"} · {draft.hotel.phone || tr(locale,"No phone saved","لا يوجد رقم هاتف")}</small></div>}
    <nav className="hotel-tabs" aria-label={tr(locale,"Hotel workspace","قسم الفنادق")}>
      <button aria-pressed={tab === "deliveries"} onClick={() => { setTab("deliveries"); setPage(1); }}>{tr(locale,"Deliveries","التسليمات")}</button>
      <button aria-pressed={tab === "invoices"} onClick={() => { setTab("invoices"); setPage(1); }}>{tr(locale,"Invoices","الفواتير")}</button>
      {data.user.role === "admin" && <button aria-pressed={tab === "directory"} onClick={() => setTab("directory")}>{tr(locale,"Hotel directory","دليل الفنادق")}</button>}
    </nav>
    {tab === "directory" && data.user.role === "admin" ? <section className="hotel-panel"><header><h3>{tr(locale,"Hotel directory","دليل الفنادق")} ({hotelTotal})</h3><button className="hotel-primary" onClick={() => setDirectoryEdit("new")}>{tr(locale,"Add hotel","إضافة فندق")}</button></header><div className="hotel-table"><table><thead><tr><th>{tr(locale,"Code","الرمز")}</th><th>{tr(locale,"Name / address","الاسم / العنوان")}</th><th>{tr(locale,"VAT number","الرقم الضريبي")}</th><th>{tr(locale,"Status","الحالة")}</th><th>{tr(locale,"Action","الإجراء")}</th></tr></thead><tbody>{hotels.map((hotel) => <tr key={hotel.id}><td>{hotel.code}</td><td><b>{hotel.name}</b><small>{hotel.address}</small></td><td>{hotel.vatNumber}</td><td>{hotel.isActive ? tr(locale,"Active","نشط") : tr(locale,"Inactive","غير نشط")}</td><td><button onClick={() => setDirectoryEdit(hotel)}>{tr(locale,"Edit","تعديل")}</button></td></tr>)}</tbody></table></div><Pagination page={directoryPage} total={hotelTotal} onPage={setDirectoryPage} locale={locale} /></section> : !hotelId ? <div className="hotel-empty">{tr(locale,"Choose a hotel above to continue.","اختر فندقاً أعلاه للمتابعة.")}</div> : <>
      {tab === "deliveries" && allowed("hotels.create") && <section className="hotel-panel"><header><div><h3>{tr(locale,"New hotel delivery","تسليم جديد للفندق")}</h3><small>{tr(locale,"Each delivery creates its own A4 invoice. Issued items and rates are locked.","لكل تسليم فاتورة A4 مستقلة. تُقفل العناصر والأسعار بعد الإصدار.")}</small></div></header>
        <div className="hotel-form-grid"><label>{tr(locale,"Delivery date","تاريخ التسليم")}<input type="date" max={today()} value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label><label>{tr(locale,"Staff handling delivery","الموظف المسؤول")}<select value={assignedStaffId} onChange={(event) => setAssignedStaffId(Number(event.target.value))}><option value="0">{tr(locale,"Select staff","اختر الموظف")}</option>{data.staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}</option>)}</select></label></div>
        <div className="hotel-catalog"><div className="hotel-category-tabs">{categories.map((entry) => <button aria-pressed={category?.id === entry.id} style={{ borderColor: entry.color }} key={entry.id} onClick={() => setCategoryId(entry.id)}>{entry.name}</button>)}</div><div className="hotel-services">{category?.services.filter((service) => service.isActive && service.priceId !== null).map((service) => <button key={service.id} style={{ borderTopColor: category.color }} onClick={() => draft.addItem({ serviceId: service.id, serviceName: service.name, categoryName: category.name, categoryColor: category.color, unitPrice: service.price, quantity: 1 })}><b>{locale === "ar" && service.nameAr ? service.nameAr : service.name}</b><span>{money(service.price)}</span></button>)}</div></div>
        <HotelLines cart={draft.cart} onLine={draft.setLine} locale={locale} />
        <div className="hotel-form-grid"><label className="wide">{tr(locale,"Delivery notes","ملاحظات التسليم")}<textarea maxLength={1000} value={draft.notes} onChange={(event) => draft.setNotes(event.target.value)} /></label></div>
        <footer className="hotel-actions"><div><span>{tr(locale,"VAT","الضريبة")} {money(totals.vatAmount)}</span><b>{money(totals.totalAmount)}</b><small>{tr(locale,"Rates apply only to this delivery.","الأسعار تخص هذا التسليم فقط.")}</small></div><button disabled={busy || !draft.cart.length} onClick={() => draft.resetDelivery()}>{tr(locale,"Clear items","مسح العناصر")}</button><button className="hotel-primary" disabled={busy || !draft.cart.length || !allowed("hotels.invoice")} onClick={() => void saveDelivery()}>{busy ? tr(locale,"Saving…","جارٍ الحفظ…") : tr(locale,"Save bill","حفظ الفاتورة")}</button>{allowed("hotels.print") && <button className="hotel-primary" disabled={busy || !draft.cart.length || !allowed("hotels.invoice")} onClick={() => void saveDelivery(true)}>{tr(locale,"Save & print","حفظ وطباعة")}</button>}</footer>
      </section>}
      <section className="hotel-panel"><header><h3>{tab === "deliveries" ? tr(locale,"Hotel delivery records","سجل تسليمات الفندق") : tr(locale,"Hotel invoices","فواتير الفندق")}</h3><label>{tr(locale,"Billing month","شهر الفاتورة")}<input type="month" max={today().slice(0, 7)} value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }} /></label>{tab === "deliveries" && <label>{tr(locale,"Find delivery token","ابحث برمز التسليم")}<input value={recordSearch} onChange={(event) => { setRecordSearch(event.target.value); setPage(1); }} /></label>}</header>
        {tab === "invoices" && <div className="hotel-metrics"><div><span>{tr(locale,"Invoiced sales","المبيعات المفوترة")}</span><b>{money(summary.sales)}</b></div><div><span>{tr(locale,"Collected","المحصّل")}</span><b>{money(summary.collected)}</b></div><div><span>{tr(locale,"Outstanding","المتبقي")}</span><b>{money(summary.balance)}</b></div></div>}
        {loading ? <LoadingRows /> : tab === "deliveries" ? <div className="hotel-table"><table><thead><tr><th>{tr(locale,"Token / date","الرمز / التاريخ")}</th><th>{tr(locale,"Staff","الموظف")}</th><th>{tr(locale,"Total","الإجمالي")}</th><th>{tr(locale,"Status","الحالة")}</th><th>{tr(locale,"Action","الإجراء")}</th></tr></thead><tbody>{deliveries.map((delivery) => <tr key={delivery.id}><td><b>{delivery.token}</b><small>{delivery.deliveryDate}</small></td><td>{delivery.assignedStaffName}</td><td>{money(delivery.totalAmount)}</td><td>{delivery.status === "cancelled" ? tr(locale,"Cancelled","ملغى") : delivery.invoiceId ? tr(locale,"Invoiced (locked)","مفوتر (مغلق)") : tr(locale,"Awaiting invoice","بانتظار الفاتورة")}</td><td><button disabled={busy} onClick={() => void openDelivery(delivery.id)}>{tr(locale,"Details","التفاصيل")}</button>{delivery.invoiceId ? <button disabled={busy} onClick={() => void openInvoice(delivery.invoiceId!)}>{tr(locale,"Invoice / print","الفاتورة / طباعة")}</button> : delivery.status === "active" && allowed("hotels.invoice") && <button disabled={busy} onClick={() => void issueInvoice(delivery.id)}>{tr(locale,"Issue invoice","إصدار الفاتورة")}</button>}</td></tr>)}{!deliveries.length && <tr><td colSpan={5}>{tr(locale,"No deliveries in this month.","لا توجد تسليمات في هذا الشهر.")}</td></tr>}</tbody></table></div> : <div className="hotel-table"><table><thead><tr><th>{tr(locale,"Invoice / month","الفاتورة / الشهر")}</th><th>{tr(locale,"Total","الإجمالي")}</th><th>{tr(locale,"Collected","المحصّل")}</th><th>{tr(locale,"Balance","الرصيد")}</th><th>{tr(locale,"Action","الإجراء")}</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td><b>{invoice.invoiceNumber}</b><small>{invoice.month}</small></td><td>{money(invoice.totalAmount)}</td><td>{money(invoice.amountPaid)}</td><td>{money(invoice.balance)}</td><td><button disabled={busy} onClick={() => void openInvoice(invoice.id)}>{tr(locale,"View / payment / print","عرض / دفع / طباعة")}</button></td></tr>)}{!invoices.length && <tr><td colSpan={5}>{tr(locale,"No invoice issued for this month.","لم تصدر فاتورة لهذا الشهر.")}</td></tr>}</tbody></table></div>}
        <Pagination page={page} total={total} onPage={setPage} locale={locale} />
      </section>
    </>}
    {selectedDelivery && <DeliveryDetails key={`${selectedDelivery.id}-${selectedDelivery.version}`} delivery={selectedDelivery} locale={locale} canUpdate={allowed("hotels.update")} canCancel={allowed("hotels.cancel")} onClose={() => setSelectedDelivery(null)} onSaved={async (delivery) => { setSelectedDelivery(delivery); await changed(); }} />}
    {selectedInvoice && <InvoiceDetails key={`${selectedInvoice.id}-${selectedInvoice.version}`} invoice={selectedInvoice} locale={locale} canUpdate={allowed("hotels.update")} canPrint={allowed("hotels.print")} onClose={() => setSelectedInvoice(null)} onPrint={onPrintInvoice} onSaved={async (invoice) => { setSelectedInvoice(invoice); await changed(); }} />}
    {directoryEdit && <HotelEditor key={directoryEdit === "new" ? "new" : directoryEdit.id} hotel={directoryEdit} locale={locale} onClose={() => setDirectoryEdit(null)} onSaved={async (hotel) => { if (draft.hotel?.id === hotel.id) draft.selectHotel(hotel); setDirectoryEdit(null); await changed(); }} />}
  </section>;
}

function HotelLines({ cart, onLine, locale }: { cart: CartItem[]; onLine: (id: number, values: Partial<Pick<CartItem,"quantity" | "unitPrice">>) => void; locale: Locale }) {
  return <div className="hotel-lines">{!cart.length ? <p>{tr(locale,"Choose service buttons to add delivery items.","اختر أزرار الخدمات لإضافة العناصر.")}</p> : cart.map((line) => <div key={line.serviceId}>
    <span><b>{line.serviceName}</b><small>{line.categoryName}</small></span>
    <label>{tr(locale,"Quantity","الكمية")}<HotelNumberInput value={line.quantity} integer onChange={(quantity) => onLine(line.serviceId, { quantity })} /></label>
    <label>{tr(locale,"Rate (SAR)","السعر (ريال)")}<HotelNumberInput value={line.unitPrice} onChange={(unitPrice) => onLine(line.serviceId, { unitPrice })} /></label>
    <b>{money(hotelDraftTotals([line]).totalAmount)}</b>
    <button aria-label={`${tr(locale,"Remove","حذف")} ${line.serviceName}`} onClick={() => onLine(line.serviceId, { quantity: 0 })}>×</button>
  </div>)}</div>;
}

function HotelNumberInput({ value, integer = false, onChange }: { value: number; integer?: boolean; onChange: (value: number) => void }) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(String(value));
  const min = integer ? 1 : 0.01; const max = integer ? 99999 : 999999.99;
  return <input type="number" min={min} max={max} step={integer ? "1" : "0.01"} inputMode={integer ? "numeric" : "decimal"} value={editing ? draft : value}
    onFocus={(event) => { setDraft(String(value)); setEditing(true); event.currentTarget.select(); }}
    onChange={(event) => { const raw = event.target.value; setDraft(raw); const number = Number(raw); if (raw.trim() && Number.isFinite(number) && number >= min && number <= max && (!integer || Number.isSafeInteger(number))) onChange(integer ? number : Math.round((number + Number.EPSILON) * 100) / 100); }}
    onBlur={() => setEditing(false)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur(); }} />;
}

function LoadingRows() { return <div className="hotel-skeleton" role="status" aria-label="Loading"><span /><span /><span /></div>; }
function Pagination({ page, total, onPage, locale }: { page: number; total: number; onPage: (page: number) => void; locale: Locale }) { return <div className="hotel-pagination"><span>{tr(locale,"Page","صفحة")} {page} / {Math.max(1, Math.ceil(total / 10))} · {total} {tr(locale,"records","سجل")}</span><button disabled={page <= 1} onClick={() => onPage(page - 1)}>{tr(locale,"Previous","السابق")}</button><button disabled={page * 10 >= total} onClick={() => onPage(page + 1)}>{tr(locale,"Next","التالي")}</button></div>; }

function HotelDialog({ title, children, onClose, locale }: { title: string; children: React.ReactNode; onClose: () => void; locale: Locale }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => { const overflow = document.body.style.overflow; const active = document.activeElement as HTMLElement | null; document.body.style.overflow = "hidden"; dialog.current?.focus(); return () => { document.body.style.overflow = overflow; active?.focus(); }; }, []);
  return <div className="hotel-dialog-backdrop" dir={locale === "ar" ? "rtl" : "ltr"}><section className="hotel-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => {
    if (event.key === "Escape") onClose();
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')); const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}><header><h3>{title}</h3><button onClick={onClose} aria-label={tr(locale,"Close","إغلاق")}>×</button></header><div className="hotel-dialog-body">{children}</div></section></div>;
}

function DeliveryDetails({ delivery, locale, canUpdate, canCancel, onClose, onSaved }: { delivery: HotelDelivery; locale: Locale; canUpdate: boolean; canCancel: boolean; onClose: () => void; onSaved: (delivery: HotelDelivery) => Promise<void> }) {
  const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notes, setNotes] = useState(delivery.notes);
  const [cart, setCart] = useState<CartItem[]>(delivery.items.map((item) => ({ serviceId: Number(item.serviceId), serviceName: item.serviceName, categoryName: item.categoryName, categoryColor: "#2563eb", quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })));
  const locked = delivery.invoiceId !== null || delivery.status === "cancelled";
  async function save(action?: "cancel") {
    if (action === "cancel" && !window.confirm(tr(locale,"Cancel this hotel delivery? Its audit record will be kept.","هل تريد إلغاء هذا التسليم؟ سيبقى سجل العملية محفوظاً."))) return;
    setBusy(true); setError("");
    try { const result = await api<{ delivery: HotelDelivery }>("/api/hotel-deliveries", { method: "PATCH", body: JSON.stringify({ id: delivery.id, version: delivery.version, ...(action ? { action } : { notes, items: cart.map(({ serviceId, quantity, unitPrice }) => ({ serviceId, quantity, unitPrice })) }) }) }); await onSaved(result.delivery); setEditing(false); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update delivery"); } finally { setBusy(false); }
  }
  return <HotelDialog title={`${tr(locale,"Hotel delivery","تسليم فندقي")} · ${delivery.token}`} onClose={() => !busy && onClose()} locale={locale}>
    {error && <p className="hotel-notice error" role="alert">{error}</p>}<div className="hotel-detail-facts"><div><small>{tr(locale,"Hotel","الفندق")}</small><b>{delivery.hotelCode} · {delivery.hotelName}</b></div><div><small>{tr(locale,"Date","التاريخ")}</small><b>{delivery.deliveryDate}</b></div><div><small>{tr(locale,"Handled by","الموظف")}</small><b>{delivery.assignedStaffName}</b></div><div><small>{tr(locale,"Created by","أنشأه")}</small><b>{delivery.createdByName}</b></div></div>
    {editing ? <><HotelLines cart={cart} locale={locale} onLine={(id, values) => setCart((lines) => values.quantity === 0 ? lines.filter((line) => line.serviceId !== id) : lines.map((line) => line.serviceId === id ? { ...line, ...values } : line))} /><label className="hotel-field">{tr(locale,"Notes","ملاحظات")}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label></> : <><div className="hotel-table"><table><thead><tr><th>{tr(locale,"Item","العنصر")}</th><th>{tr(locale,"Quantity","الكمية")}</th><th>{tr(locale,"Rate","السعر")}</th><th>{tr(locale,"Total","الإجمالي")}</th></tr></thead><tbody>{delivery.items.map((item, index) => <tr key={index}><td>{item.serviceName}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.totalAmount)}</td></tr>)}</tbody></table></div><p>{delivery.notes}</p></>}
    <div className="hotel-actions"><b>{money(delivery.totalAmount)}</b>{locked ? <span>{delivery.status === "cancelled" ? tr(locale,"Cancelled","ملغى") : tr(locale,"Included in issued invoice — read only","مُدرج في فاتورة صادرة — للقراءة فقط")}</span> : editing ? <><button disabled={busy} onClick={() => setEditing(false)}>{tr(locale,"Back","رجوع")}</button><button className="hotel-primary" disabled={busy || !cart.length || !canUpdate} onClick={() => void save()}>{tr(locale,"Save changes","حفظ التعديلات")}</button></> : <>{canCancel && <button className="hotel-danger" disabled={busy} onClick={() => void save("cancel")}>{tr(locale,"Cancel delivery","إلغاء التسليم")}</button>}{canUpdate && <button disabled={busy} onClick={() => setEditing(true)}>{tr(locale,"Edit delivery","تعديل التسليم")}</button>}</>}</div>
  </HotelDialog>;
}

function InvoiceDetails({ invoice, locale, canUpdate, canPrint, onClose, onPrint, onSaved }: { invoice: HotelInvoice; locale: Locale; canUpdate: boolean; canPrint: boolean; onClose: () => void; onPrint: (invoice: HotelInvoice) => void; onSaved: (invoice: HotelInvoice) => Promise<void> }) {
  const [amount, setAmount] = useState(Number(invoice.balance)); const [method, setMethod] = useState<"cash" | "card">("card"); const [account, setAccount] = useState("stc"); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [requestKey] = useState(hotelRequestKey);
  async function pay(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const result = await api<{ invoice: HotelInvoice }>("/api/hotel-invoices", { method: "PATCH", body: JSON.stringify({ id: invoice.id, version: invoice.version, requestKey, amount, method, account: method === "card" ? account : null }) }); await onSaved(result.invoice); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to record payment"); } finally { setBusy(false); } }
  return <HotelDialog title={invoice.invoiceNumber} onClose={() => !busy && onClose()} locale={locale}>
    {error && <p className="hotel-notice error" role="alert">{error}</p>}<div className="hotel-selected"><b>{invoice.hotel.code} · {invoice.hotel.name}</b><span>{invoice.hotel.address}</span><small>{tr(locale,"Billing month","شهر الفاتورة")}: {invoice.month} · {tr(locale,"VAT number","الرقم الضريبي")}: {invoice.hotel.vatNumber}</small></div>
    <div className="hotel-table"><table><thead><tr><th>{tr(locale,"Delivery / date","التسليم / التاريخ")}</th><th>{tr(locale,"Item","العنصر")}</th><th>{tr(locale,"Qty","الكمية")}</th><th>{tr(locale,"Rate","السعر")}</th><th>{tr(locale,"Total","الإجمالي")}</th></tr></thead><tbody>{invoice.items.map((item, index) => <tr key={index}><td>{item.token}<small>{item.deliveryDate}</small></td><td>{item.serviceName}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(item.totalAmount)}</td></tr>)}</tbody></table></div>
    <div className="hotel-metrics"><div><small>{tr(locale,"Total","الإجمالي")}</small><b>{money(invoice.totalAmount)}</b></div><div><small>{tr(locale,"Collected","المحصّل")}</small><b>{money(invoice.amountPaid)}</b></div><div><small>{tr(locale,"Balance","الرصيد")}</small><b>{money(invoice.balance)}</b></div></div>
    {canUpdate && Number(invoice.balance) > 0 && <form onSubmit={(event) => void pay(event)} className="hotel-payment"><h4>{tr(locale,"Record a payment","تسجيل دفعة")}</h4><div className="hotel-form-grid"><label>{tr(locale,"Payment amount","مبلغ الدفعة")}<input required type="number" min="0.01" max={invoice.balance} step="0.01" value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label><label>{tr(locale,"Method","الطريقة")}<select value={method} onChange={(event) => setMethod(event.target.value as "cash" | "card")}><option value="card">{tr(locale,"Card","بطاقة")}</option><option value="cash">{tr(locale,"Cash","نقدي")}</option></select></label>{method === "card" && <label>{tr(locale,"Receiving account","الحساب المستلم")}<select value={account} onChange={(event) => setAccount(event.target.value)}><option value="stc">STC</option><option value="anb">ANB</option></select></label>}</div><p>{tr(locale,"This adds a new payment; it does not replace earlier payments.","تضيف هذه العملية دفعة جديدة ولا تستبدل الدفعات السابقة.")}</p><button className="hotel-primary" disabled={busy || !(amount > 0) || amount > Number(invoice.balance)}>{busy ? tr(locale,"Saving…","جارٍ الحفظ…") : tr(locale,"Save payment","حفظ الدفعة")}</button></form>}
    <h4>{tr(locale,"Payment history","سجل الدفعات")}</h4><div className="hotel-table"><table><thead><tr><th>{tr(locale,"Date","التاريخ")}</th><th>{tr(locale,"Amount","المبلغ")}</th><th>{tr(locale,"Method / account","الطريقة / الحساب")}</th><th>{tr(locale,"Recorded by","سجلها")}</th></tr></thead><tbody>{invoice.payments.map((payment) => <tr key={payment.id}><td>{new Date(payment.createdAt).toLocaleString(locale === "ar" ? "ar-SA" : "en-SA")}</td><td>{money(payment.amount)}</td><td>{payment.method === "card" ? `${tr(locale,"Card","بطاقة")} · ${(payment.account ?? "").toUpperCase()}` : tr(locale,"Cash","نقدي")}</td><td>{payment.actorName}</td></tr>)}{!invoice.payments.length && <tr><td colSpan={4}>{tr(locale,"No payments recorded.","لم يتم تسجيل دفعات.")}</td></tr>}</tbody></table></div>{canPrint && <div className="hotel-actions"><button className="hotel-primary" onClick={() => onPrint(invoice)}>{tr(locale,"Print A4 invoice","طباعة فاتورة A4")}</button></div>}
  </HotelDialog>;
}

function HotelEditor({ hotel, locale, onClose, onSaved }: { hotel: HotelCustomer | "new"; locale: Locale; onClose: () => void; onSaved: (hotel: HotelCustomer) => Promise<void> }) {
  const [form, setForm] = useState(hotel === "new" ? { code: "", name: "", address: "", phone: "", vatNumber: "", postalCode: "", additionalNumber: "", otherId: "", isActive: true } : hotel); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const fields: Array<["code" | "name" | "address" | "phone" | "vatNumber" | "postalCode" | "additionalNumber" | "otherId", string, string]> = [["code","Hotel code","رمز الفندق"],["name","Hotel name","اسم الفندق"],["address","Address","العنوان"],["phone","Phone","الهاتف"],["vatNumber","VAT number","الرقم الضريبي"],["postalCode","Postal code","الرمز البريدي"],["additionalNumber","Additional number","الرقم الإضافي"],["otherId","Other ID","معرف آخر"]];
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(""); try { const result = await api<{hotel: HotelCustomer}>("/api/hotels", { method: hotel === "new" ? "POST" : "PATCH", body: JSON.stringify(form) }); await onSaved(result.hotel); } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save hotel"); } finally { setBusy(false); } }
  return <HotelDialog title={tr(locale,hotel === "new" ? "Add hotel" : "Edit hotel",hotel === "new" ? "إضافة فندق" : "تعديل الفندق")} onClose={() => !busy && onClose()} locale={locale}><form onSubmit={(event) => void submit(event)}>{error && <p className="hotel-notice error" role="alert">{error}</p>}<div className="hotel-form-grid">{fields.map(([key,en,ar]) => <label key={key} className={key === "address" || key === "name" ? "wide" : ""}>{tr(locale,en,ar)}<input required={key === "code" || key === "name"} value={form[key]} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<label>{tr(locale,"Status","الحالة")}<select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}><option value="active">{tr(locale,"Active","نشط")}</option><option value="inactive">{tr(locale,"Inactive","غير نشط")}</option></select></label></div><p>{tr(locale,"Deactivating a hotel hides it from new deliveries. Existing invoices and history are preserved.","يُخفي تعطيل الفندق من التسليمات الجديدة مع الاحتفاظ بالفواتير والسجل السابق.")}</p><div className="hotel-actions"><button className="hotel-primary" disabled={busy}>{busy ? tr(locale,"Saving…","جارٍ الحفظ…") : tr(locale,"Save hotel","حفظ الفندق")}</button></div></form></HotelDialog>;
}
