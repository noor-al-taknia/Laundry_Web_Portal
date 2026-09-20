"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, ApiError } from "../../app/client";
import { Receipt, type ReceiptData } from "../../app/components/Receipt";
import { calculateInvoice } from "../../lib/invoice";
import type {
  BootstrapData,
  Category,
  Customer,
  Expense,
  Order,
  OrderDetail,
  User,
} from "../../contracts/src";
import { useOfficeStore } from "./store";
import HotelWorkspace from "./HotelWorkspace";
import { useHotelPrinter } from "./useHotelPrinter";
import { useHotelStore } from "./hotel-store";
import { BusinessDayPanel } from "./BusinessDayPanel";
import { PasswordToggle } from "../../app/components/PasswordToggle";

const sar = new Intl.NumberFormat("en-SA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
type Locale = "en" | "ar";
const tr = (locale: Locale, en: string, ar: string) => locale === "ar" ? ar : en;

function riyadhToday() {
  return new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 10);
}

function receiptFromOrder(detail: OrderDetail): ReceiptData {
  return {
    invoiceNumber: detail.order.invoiceNumber,
    tokenNumber: detail.order.tokenNumber,
    orderDateTime: detail.order.createdAt,
    supplyDate: detail.order.supplyDate,
    customerName: detail.order.customerName,
    customerPhone: detail.order.customerPhone,
    customerAddress: detail.order.customerAddress,
    paymentMethod: detail.order.paymentMethod,
    cardAccount: detail.order.cardAccount,
    cashReceived: Number(detail.order.cashReceived),
    balanceSettledByStaff: Boolean(detail.order.balanceSettledByStaff),
    settledFromStaff: Number(detail.order.settledFromStaff),
    settledFromDrawer: Number(detail.order.settledFromDrawer),
    paymentStatus: detail.order.paymentStatus,
    assignedStaffName: detail.order.assignedStaffName,
    subtotal: Number(detail.order.subtotal),
    discount: Number(detail.order.discount),
    vatAmount: Number(detail.order.vatAmount),
    totalAmount: Number(detail.order.totalAmount),
    amountPaid: Number(detail.order.amountPaid),
    balance: Number(detail.order.balance),
    items: detail.items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      quantity: Number(item.quantity),
      taxableAmount: Number(item.taxableAmount),
      vatAmount: Number(item.vatAmount),
      totalAmount: Number(item.totalAmount),
    })),
  };
}

export default function OfficePortal() {
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hotelMode, setHotelMode] = useState(false);
  const { printHotelInvoice, hotelPrintNode } = useHotelPrinter(setError);
  const [profileOpen, setProfileOpen] = useState(false);
  const [showDayPanel, setShowDayPanel] = useState(false);
  const [tokenSearch, setTokenSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [printReceipt, setPrintReceipt] = useState<ReceiptData | null>(null);
  const [locale, setLocale] = useState<Locale>(() => typeof window !== "undefined" && localStorage.getItem("laundry-office-locale") === "ar" ? "ar" : "en");
  const { section, setSection } = useOfficeStore();

  const load = useCallback(async () => {
    try {
      const result = await api<BootstrapData>("/api/bootstrap");
      useOfficeStore.getState().bindUser(result.user.id);
      useHotelStore.getState().bindUser(result.user.id);
      setData(result);
      setError("");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        useOfficeStore.getState().bindUser(null);
        useHotelStore.getState().bindUser(null);
        setData(null);
        setSelectedOrder(null);
        setPrintReceipt(null);
        setSearchResults([]);
      }
      else setError(caught instanceof Error ? caught.message : "Unable to open office portal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial data synchronization with the backend.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function changeLocale(next: Locale) {
    setLocale(next);
    localStorage.setItem("laundry-office-locale", next);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    useOfficeStore.getState().bindUser(null);
    useHotelStore.getState().bindUser(null);
    setHotelMode(false);
    setData(null);
    setSelectedOrder(null);
    setPrintReceipt(null);
    setSearchResults([]);
    setTokenSearch("");
    setProfileOpen(false);
  }

  async function searchToken(event: FormEvent) {
    event.preventDefault();
    if (!tokenSearch.trim()) return setSearchResults([]);
    try {
      const query = new URLSearchParams({
        customer: tokenSearch.trim(),
        from: data?.reportRange.from ?? riyadhToday(),
        to: riyadhToday(),
        pageSize: "10",
      });
      const result = await api<{ orders: Order[] }>(`/api/orders?${query}`);
      setSearchResults(result.orders);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Token search failed");
    }
  }

  async function openOrder(orderId: number) {
    setOrderLoading(true);
    setSearchResults([]);
    try {
      const result = await api<{ detail: OrderDetail }>(`/api/orders?id=${orderId}`);
      setSelectedOrder(result.detail);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr(locale, "Order details could not be loaded.", "تعذر تحميل تفاصيل الطلب."));
    } finally {
      setOrderLoading(false);
    }
  }

  async function printOrder(detail: OrderDetail) {
    try {
      const result = await api<{detail: OrderDetail}>(`/api/orders?id=${detail.order.id}&purpose=print`);
      flushSync(() => setPrintReceipt(receiptFromOrder(result.detail)));
      await document.fonts.ready;
      requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to print bill."); }
  }

  if (loading) return <OfficeLoading />;
  if (!data) return <OfficeLogin error={error} onLogin={async () => { setLoading(true); await load(); }} locale={locale} changeLocale={changeLocale} />;
  const allowed = (operation: string) => data.user.role === "admin" || data.staffAccess?.capabilities[operation] !== false;
  const hotelToggle = allowed("hotels.view") && <button type="button" className="hotel-mode-toggle" role="switch" aria-checked={hotelMode} onClick={() => { setHotelMode((value) => !value); setSelectedOrder(null); setSearchResults([]); }}>{tr(locale,"Hotel billing","فواتير الفنادق")} <strong>{hotelMode ? tr(locale,"On","مفعل") : tr(locale,"Off","غير مفعل")}</strong></button>;

  return (
    <main className="office-shell" dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <header className="office-topbar no-print">
        <div className="office-brand">
          <span>{data.shop.shopName.split(/\s+/).slice(0, 2).map((word) => word[0]).join("")}</span>
          <div><b>{locale === "ar" && data.shop.shopNameAr ? data.shop.shopNameAr : data.shop.shopName}</b><small>{tr(locale,"Office portal","بوابة المكتب")}</small></div>
        </div>
        <nav className="office-tabs" aria-label="Office workspace">
          <button className={section === "sales" ? "active" : ""} onClick={() => setSection("sales")}>{tr(locale,"Sales","المبيعات")}</button>
          <button className={section === "expenses" ? "active" : ""} onClick={() => setSection("expenses")}>{tr(locale,"Expenses","المصروفات")}</button>
          <button className={section === "collections" ? "active" : ""} onClick={() => setSection("collections")}>{tr(locale,"Collections","التحصيل اليومي")}</button>
        </nav>
        <div className="office-actions">
          <form className="token-search" onSubmit={searchToken} hidden={hotelMode}>
            <input value={tokenSearch} onChange={(event) => setTokenSearch(event.target.value)} placeholder={tr(locale,"Token, name or phone","الرمز أو الاسم أو الجوال")} aria-label={tr(locale,"Search orders by token, invoice, name or phone","ابحث بالرمز أو الفاتورة أو الاسم أو الجوال")} />
            <button aria-label="Run token search">⌕</button>
          </form>
          <button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)} aria-label="Open profile menu">
            {data.user.displayName.slice(0, 2).toUpperCase()}
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <div><b>{data.user.displayName}</b><span>{data.user.portalRole.replaceAll("_", " ")}</span></div>
              <button className="profile-language" onClick={() => changeLocale(locale === "en" ? "ar" : "en")}>{locale === "en" ? "العربية" : "English"}</button>
              {allowed("day.view") && <button onClick={() => { setShowDayPanel(value => !value); setProfileOpen(false); }}>{tr(locale,"Shop day · opening / closing","يوم العمل · الافتتاح / الإغلاق")}</button>}
              <button onClick={() => setError(tr(locale,"Profile editing is available from the admin portal.","تعديل الملف الشخصي متاح من بوابة الإدارة."))}>{tr(locale,"Profile","الملف الشخصي")}</button>
              {data.user.role === "admin" && <a href={process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3001"}>{tr(locale,"Admin portal","بوابة الإدارة")}</a>}
              <button onClick={() => setError(tr(locale,"Account and shop settings are managed in the admin portal.","تُدار إعدادات الحساب والمتجر من بوابة الإدارة."))}>{tr(locale,"Settings","الإعدادات")}</button>
              <button className="logout" onClick={logout}>{tr(locale,"Logout","تسجيل الخروج")}</button>
            </div>
          )}
        </div>
      </header>

      {error && <div className="office-alert no-print">{error}<button onClick={() => setError("")}>×</button></div>}
      {searchResults.length > 0 && (
        <div className="token-results no-print">
          <div><b>{tr(locale,"Token results","نتائج البحث بالرمز")}</b><button onClick={() => setSearchResults([])}>×</button></div>
          {searchResults.map((order) => (
            <button className="token-result" key={order.id} onClick={() => void openOrder(order.id)}><strong>{order.tokenNumber || "Legacy order"}</strong><span>{order.invoiceNumber} · {order.customerName}<small>{order.customerPhone || tr(locale,"No phone","لا يوجد جوال")}</small></span><b>SAR {sar.format(Number(order.totalAmount))}</b></button>
          ))}
        </div>
      )}

      {orderLoading && <div className="order-loading-toast no-print">{tr(locale,"Loading order…","جارٍ تحميل الطلب…")}</div>}
      {allowed("day.view") && <BusinessDayPanel locale={locale} refreshKey={data} hideAfterOpening={!showDayPanel} onChange={() => { setShowDayPanel(false); void load(); }} />}

      {section === "sales" && hotelMode && allowed("hotels.view") ? (
        <section className="hotel-sales-screen"><HotelWorkspace data={data} locale={locale} onChanged={load} onPrintInvoice={printHotelInvoice} toolbar={hotelToggle} /></section>
      ) : section === "sales" && (allowed("sales.create") || allowed("sales.view")) ? (
        <SalesWorkspace key={data.user.id} data={data} refresh={load} reportError={setError} locale={locale} openOrder={openOrder} hotelToggle={hotelToggle} onPrintReceipt={(receipt) => setPrintReceipt(receipt)} />
      ) : section === "expenses" ? (
        allowed("expenses.view") ? <ExpenseWorkspace reportError={setError} locale={locale} /> : <p className="office-alert">{tr(locale,"Expense access is disabled by the admin.","تم تعطيل الوصول للمصروفات بواسطة المسؤول.")}</p>
      ) : section === "collections" && allowed("sales.view") ? (
        <CollectionWorkspace locale={locale} reportError={setError} openOrder={openOrder} />
      ) : <p className="office-alert">{tr(locale,"This operation is disabled by the admin.","تم تعطيل هذه العملية بواسطة المسؤول.")}{hotelToggle}</p>}
      {selectedOrder && <OrderDetailModal key={selectedOrder.order.id} detail={selectedOrder} locale={locale} onClose={() => setSelectedOrder(null)} onSaved={async (detail) => { setSelectedOrder(detail); await load(); }} onPrint={printOrder} reportError={setError} />}
      {printReceipt && <div className="office-print-receipt"><Receipt shop={data.shop} receipt={printReceipt} /></div>}
      {hotelPrintNode}
    </main>
  );
}

function OfficeLoading() {
  return (
    <main className="office-shell office-loading">
      <div className="office-loading-mark">PL</div>
      <div><b>Opening office portal</b><span>Loading shop data…</span></div>
    </main>
  );
}

function OfficeLogin({ error, onLogin, locale, changeLocale }: { error: string; onLogin: (user: User) => Promise<void>; locale: Locale; changeLocale: (locale: Locale) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error);
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      await onLogin(result.user);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }
  async function requestReset() {
    if (!username.trim()) return setMessage(tr(locale, "Enter your username first.", "أدخل اسم المستخدم أولاً."));
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/password-requests", { method: "POST", body: JSON.stringify({ username }) });
      setMessage(result.message);
      setResetSent(true);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : tr(locale, "Request could not be sent.", "تعذر إرسال الطلب."));
    } finally { setBusy(false); }
  }
  return (
    <main className="office-login" dir={locale === "ar" ? "rtl" : "ltr"}>
      <section className="office-login-copy"><span>PL</span><p>PEARL LAUNDRY</p><h1>{tr(locale,"Fast orders.","طلبات أسرع.")}<br />{tr(locale,"Clear daily costs.","مصروفات يومية واضحة.")}</h1><small>{tr(locale,"Secure office operations for your front desk.","تشغيل آمن وسهل لمكتب الاستقبال.")}</small></section>
      <form onSubmit={resetMode ? (event) => { event.preventDefault(); void requestReset(); } : submit}>
        <button className="login-language" type="button" onClick={() => changeLocale(locale === "en" ? "ar" : "en")}>{locale === "en" ? "العربية" : "English"}</button><p>{tr(locale,"OFFICE PORTAL","بوابة المكتب")}</p><h2>{resetMode ? tr(locale,"Reset password","إعادة كلمة المرور") : tr(locale,"Welcome back","مرحباً بعودتك")}</h2><span>{resetMode ? tr(locale,"Enter your username to send a reset request to the administrator.","أدخل اسم المستخدم لإرسال طلب إعادة كلمة المرور إلى المسؤول.") : tr(locale,"Sign in with your assigned account.","سجّل الدخول بالحساب المخصص لك.")}</span>
        {message && <div className="office-login-error">{message}</div>}
        <label>{tr(locale,"Username","اسم المستخدم")}<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required /></label>
        {!resetMode && <label>{tr(locale,"Password","كلمة المرور")}<span className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><PasswordToggle shown={showPassword} onToggle={() => setShowPassword(shown => !shown)} locale={locale} /></span></label>}
        <button disabled={busy || (resetMode && resetSent)}>{busy ? tr(locale,"Please wait…","يرجى الانتظار…") : resetMode ? tr(locale,"Send reset request","إرسال طلب إعادة التعيين") : tr(locale,"Sign in","تسجيل الدخول")}</button>
        <div className="login-help">{resetMode ? <button type="button" onClick={() => { setResetMode(false); setResetSent(false); setMessage(""); }}>{tr(locale,"Back to sign in","العودة لتسجيل الدخول")}</button> : <button type="button" onClick={() => { setResetMode(true); setMessage(""); }}>{tr(locale,"Reset password","طلب إعادة كلمة المرور")}</button>}</div>
      </form>
    </main>
  );
}

function SalesWorkspace({ data, refresh, reportError, locale, openOrder, onPrintReceipt, hotelToggle }: { data: BootstrapData; refresh: () => Promise<void>; reportError: (message: string) => void; locale: Locale; openOrder: (id: number) => Promise<void>; onPrintReceipt: (receipt: ReceiptData) => void; hotelToggle?: React.ReactNode }) {
  const { cart, customer, categoryId, setCategoryId, addItem, setQuantity, setUnitPrice, setCustomer, resetSale } = useOfficeStore();
  const activeCategories = data.catalog.filter((category) => category.isActive);
  const activeCategory = activeCategories.find((category) => category.id === categoryId) ?? activeCategories[0];
  const [showCustomers, setShowCustomers] = useState(false);
  const [customerPanelOpen, setCustomerPanelOpen] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [cardAccount, setCardAccount] = useState<"stc" | "anb">("stc");
  const [balanceSettledByStaff, setBalanceSettledByStaff] = useState(false);
  const [settledFromStaff, setSettledFromStaff] = useState(0);
  const [settledFromDrawer, setSettledFromDrawer] = useState(0);
  const [assignedStaffId, setAssignedStaffId] = useState(() => data.user.role === "staff" ? data.user.id : data.staffUsers[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [recentOpen, setRecentOpen] = useState(false);
  const effectivePaid = paymentMethod === "cash" && balanceSettledByStaff
    ? amountPaid + settledFromStaff + settledFromDrawer
    : amountPaid;
  const totals = useMemo(() => calculateInvoice(cart, discount, effectivePaid), [cart, discount, effectivePaid]);
  const matches = useMemo(() => {
    const query = customer.query.trim().toLowerCase();
    return data.customers.filter((entry) => !query || `${entry.name} ${entry.phone}`.toLowerCase().includes(query)).slice(0, 6);
  }, [customer.query, data.customers]);

  function selectCustomer(selected: Customer) {
    setCustomer({ id: selected.id, query: selected.name, name: selected.name, phone: selected.phone, email: selected.email, address: selected.address });
    setShowCustomers(false);
    if (assignedStaffId) setCustomerPanelOpen(false);
  }

  function addService(category: Category, service: Category["services"][number]) {
    if (!service.price) return reportError(`${service.name} needs an active price.`);
    addItem({ serviceId: service.id, categoryName: category.name, categoryColor: category.color, serviceName: service.name, unitPrice: service.price, quantity: 1 });
  }

  async function save(printAfter: boolean) {
    if (data.user.role !== "admin" && data.staffAccess?.capabilities["sales.create"] === false) return reportError("The admin has disabled new sales for your account.");
    if (printAfter && data.user.role !== "admin" && data.staffAccess?.capabilities["sales.print"] === false) return reportError("The admin has disabled printing for your account. Use Save instead.");
    if (!cart.length) return reportError("Add at least one service.");
    if (!assignedStaffId) return reportError(tr(locale, "Select the staff member handling this bill.", "اختر الموظف المسؤول عن هذه الفاتورة."));
    setBusy(true);
    try {
      const result = await api<{ order: OrderDetail }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customerId: customer.id,
          assignedStaffId,
          saveCustomer: !customer.id && Boolean(customer.name),
          customer,
          items: cart.map((item) => ({ serviceId: item.serviceId, quantity: item.quantity, unitPrice: item.unitPrice })),
          discount: totals.discount,
          amountPaid: totals.amountPaid,
          paymentMethod,
          cardAccount: paymentMethod === "card" ? cardAccount : null,
          cashReceived: paymentMethod === "cash" ? amountPaid : 0,
          balanceSettledByStaff: paymentMethod === "cash" && balanceSettledByStaff,
          settledFromStaff: paymentMethod === "cash" && balanceSettledByStaff ? settledFromStaff : 0,
          settledFromDrawer: paymentMethod === "cash" && balanceSettledByStaff ? settledFromDrawer : 0,
          supplyDate: riyadhToday(),
        }),
      });
      const receipt = receiptFromOrder(result.order);
      flushSync(() => {
        onPrintReceipt(receipt);
        resetSale();
        setDiscount(0);
        setAmountPaid(0);
        setBalanceSettledByStaff(false);
        setSettledFromStaff(0);
        setSettledFromDrawer(0);
      });
      setSuccess(`${receipt.tokenNumber} saved · ${receipt.invoiceNumber}`);
      if (printAfter) requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
      await refresh();
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : "Order could not be saved");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sales-screen no-print-preview">
      <div className="sales-main">
        <div className="sales-heading"><div><p>{tr(locale,"NEW SALE · WALK-IN CUSTOMERS","طلب جديد · العملاء المباشرون")}</p><h1>{tr(locale,"Take an order","إنشاء طلب")}</h1></div>{hotelToggle}{success && <div className="token-card success"><span>{tr(locale,"LAST TOKEN","آخر رمز")}</span><b>{success.split(" saved")[0]}</b></div>}</div>
        <section className={`sales-party-panel ${customerPanelOpen ? "open" : "collapsed"}`}>
          <button className="sales-party-summary" type="button" onClick={() => setCustomerPanelOpen((open) => !open)}><span><b>{tr(locale,"Customer & staff","العميل والموظف")}</b><small>{customer.name || tr(locale,"Walk-in customer","عميل مباشر")} · {data.staffUsers.find((staff) => staff.id === assignedStaffId)?.displayName || tr(locale,"Select staff","اختر الموظف")}</small></span><i>{customerPanelOpen ? "−" : tr(locale,"Edit","تعديل")}</i></button>
        {customerPanelOpen && <div className="sales-controls">
          <div className="customer-control">
            <label>{tr(locale,"Customer","العميل")}<input value={customer.query} onFocus={() => setShowCustomers(true)} onChange={(event) => { setCustomer({ id: null, query: event.target.value, name: event.target.value }); setShowCustomers(true); }} placeholder={tr(locale,"Search or enter customer","ابحث أو أدخل اسم العميل")} /></label>
            {showCustomers && <div className="office-customer-results">{matches.map((entry) => <button key={entry.id} onClick={() => selectCustomer(entry)}><b>{entry.name}</b><span>{entry.phone || entry.email || tr(locale,"No contact","لا توجد بيانات اتصال")}</span></button>)}{!matches.length && <p>{tr(locale,"No saved match. Continue as a new customer.","لا يوجد عميل مطابق. أكمل كعميل جديد.")}</p>}</div>}
          </div>
          <label>{tr(locale,"Mobile","الجوال")}<input value={customer.phone} onChange={(event) => setCustomer({ phone: event.target.value })} placeholder="05xxxxxxxx" /></label>
          <label>{tr(locale,"Staff handling bill","الموظف المسؤول عن الفاتورة")}<select required value={assignedStaffId} onChange={(event) => setAssignedStaffId(Number(event.target.value))}><option value={0}>{tr(locale,"Select staff","اختر الموظف")}</option>{data.staffUsers.map((staff) => <option key={staff.id} value={staff.id}>{staff.displayName}{staff.phone ? ` · ${staff.phone}` : ""}</option>)}</select></label>
          <button className="party-done" type="button" disabled={!assignedStaffId} onClick={() => { setShowCustomers(false); setCustomerPanelOpen(false); }}>{tr(locale,"Done","تم")}</button>
        </div>}
        </section>
        <div className="item-grid">
          {activeCategory?.services.filter((service) => service.isActive).map((service) => (
            <button key={service.id} style={{ "--item-accent": activeCategory.color } as React.CSSProperties} onClick={() => addService(activeCategory, service)}><span>{service.name}<small>{service.nameAr}</small></span><b>SAR {sar.format(service.price)}</b></button>
          ))}
        </div>
        <div className="sale-cart">
          <header><div><p>{tr(locale,"ORDER ITEMS","عناصر الطلب")}</p><h2>{cart.length ? `${cart.length} ${tr(locale,"service lines","خدمات")}` : tr(locale,"No items added","لم تتم إضافة عناصر")}</h2></div><button onClick={resetSale}>{tr(locale,"Clear","مسح")}</button></header>
          <div className="sale-cart-lines">
            {cart.map((item) => <article key={item.serviceId}>
              <i style={{ background: item.categoryColor }} />
              <div className="cart-item-name"><b>{item.serviceName}</b><span>{item.categoryName}</span></div>
              <label className="cart-line-rate"><span>{tr(locale,"Rate (SAR)","السعر (ريال)")}</span><CartNumberInput value={item.unitPrice} min={0.01} max={999999.99} step="0.01" label={`${tr(locale,"Rate for","سعر")} ${item.serviceName}`} onChange={(value) => setUnitPrice(item.serviceId, value)} /></label>
              <div className="office-qty"><button type="button" aria-label={`${tr(locale,"Decrease quantity for","تقليل كمية")} ${item.serviceName}`} onClick={() => setQuantity(item.serviceId, item.quantity - 1)}>−</button><CartNumberInput value={item.quantity} min={1} max={99999} step="1" label={`${tr(locale,"Quantity for","كمية")} ${item.serviceName}`} onChange={(value) => setQuantity(item.serviceId, value)} /><button type="button" aria-label={`${tr(locale,"Increase quantity for","زيادة كمية")} ${item.serviceName}`} onClick={() => setQuantity(item.serviceId, item.quantity + 1)}>+</button></div>
              <b>SAR {sar.format(item.unitPrice * item.quantity * 1.15)}</b>
            </article>)}
            {!cart.length && <div className="office-empty">{tr(locale,"Choose a category, then tap service buttons to build the order.","اختر فئة ثم اضغط على أزرار الخدمات لإنشاء الطلب.")}</div>}
          </div>
          <footer>
            <div className="office-payment"><div className="office-segment"><button className={paymentMethod === "card" ? "active" : ""} onClick={() => setPaymentMethod("card")}>{tr(locale,"Card","بطاقة")}</button><button className={paymentMethod === "cash" ? "active" : ""} onClick={() => setPaymentMethod("cash")}>{tr(locale,"Cash","نقدي")}</button></div><label>{tr(locale,"Discount","الخصم")}<input type="number" min="0" step="0.01" value={discount} onChange={(event) => setDiscount(Number(event.target.value))} /></label><label>{paymentMethod === "cash" ? tr(locale,"Cash received","المبلغ المستلم") : tr(locale,"Card amount","مبلغ البطاقة")}<input type="number" min="0" step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(Number(event.target.value))} /></label>{paymentMethod === "card" && <label>{tr(locale,"Receiving bank","الحساب المستلم")}<select value={cardAccount} onChange={(event) => setCardAccount(event.target.value as "stc" | "anb")}><option value="stc">STC Bank</option><option value="anb">ANB</option></select></label>}{paymentMethod === "cash" && <div className="cash-settlement"><label className="cash-check"><input type="checkbox" checked={balanceSettledByStaff} onChange={(event) => setBalanceSettledByStaff(event.target.checked)} />{tr(locale,"Balance settled by staff","تمت تسوية الرصيد بواسطة الموظف")}</label>{balanceSettledByStaff && <div><label>{tr(locale,"From staff","من الموظف")}<input type="number" min="0" step="0.01" value={settledFromStaff} onChange={(event) => setSettledFromStaff(Number(event.target.value))} /></label><label>{tr(locale,"From drawer/wallet","من درج النقد/المحفظة")}<input type="number" min="0" step="0.01" value={settledFromDrawer} onChange={(event) => setSettledFromDrawer(Number(event.target.value))} /></label></div>}</div>}</div>
            <div className="office-total"><span>{tr(locale,"VAT","الضريبة")} SAR {sar.format(totals.vatAmount)}</span><b>SAR {sar.format(totals.totalAmount)}</b><small>{tr(locale,"Balance","الرصيد")} SAR {sar.format(totals.balance)}</small></div>
            <button className="save-order" disabled={busy} onClick={() => save(false)}>{busy ? tr(locale,"Saving…","جارٍ الحفظ…") : tr(locale,"Save","حفظ")}</button>
            <button className="save-print" disabled={busy} onClick={() => save(true)}>{tr(locale,"Save & print","حفظ وطباعة")}</button>
          </footer>
        </div>
        <section className="recent-order-cards no-print">
          <header><button type="button" className="recent-orders-toggle" aria-expanded={recentOpen} aria-controls="recent-order-list" onClick={() => setRecentOpen((open) => !open)}><span><small>{tr(locale,"SAVED ORDERS","الطلبات المحفوظة")}</small><b>{tr(locale,"Recent orders","أحدث الطلبات")} ({Math.min(data.recentOrders.length, 12)})</b></span><span aria-hidden="true">{recentOpen ? "−" : "+"}</span></button></header>
          {recentOpen && <div id="recent-order-list">{data.recentOrders.slice(0, 12).map((order) => <button key={order.id} onClick={() => void openOrder(order.id)}><span className={`order-status ${order.paymentStatus}`}>{tr(locale, order.paymentStatus, order.paymentStatus === "paid" ? "مدفوع" : order.paymentStatus === "partial" ? "جزئي" : "غير مدفوع")}</span><strong>{order.tokenNumber}</strong><b>{order.customerName}</b><small>{order.customerPhone || order.invoiceNumber}</small><em>SAR {sar.format(Number(order.totalAmount))}</em></button>)}{!data.recentOrders.length && <p className="office-empty">{tr(locale,"No recent orders yet.","لا توجد طلبات حديثة بعد.")}</p>}</div>}
        </section>
      </div>
      <aside className="category-rail">
        <p>{tr(locale,"CATEGORIES","الفئات")}</p>
        {activeCategories.map((category) => <button key={category.id} className={activeCategory?.id === category.id ? "active" : ""} style={{ "--category": category.color } as React.CSSProperties} onClick={() => setCategoryId(category.id)}><span>{category.name}</span><small>{category.services.filter((service) => service.isActive).length} {tr(locale,"items","عناصر")}</small></button>)}
      </aside>
    </section>
  );
}

function CartNumberInput({ value, min, max, step, label, onChange }: { value: number; min: number; max: number; step: string; label: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  return <input type="number" inputMode={step === "1" ? "numeric" : "decimal"} min={min} max={max} step={step} aria-label={label} value={editing ? draft : value}
    onFocus={(event) => { setEditing(true); setDraft(String(value)); event.currentTarget.select(); }}
    onChange={(event) => { const raw = event.target.value; setDraft(raw); const next = Number(raw); if (raw.trim() && Number.isFinite(next) && next >= min && next <= max && (step !== "1" || Number.isSafeInteger(next))) onChange(next); }}
    onBlur={() => setEditing(false)}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur(); }} />;
}

function ExpenseWorkspace({ reportError, locale }: { reportError: (message: string) => void; locale: Locale }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ expenseDate: riyadhToday(), category: "Utilities", description: "", amount: 0, paymentMethod: "cash", vendor: "", receiptReference: "", notes: "" });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ expenses: Expense[]; totalAmount: number }>(`/api/expenses?from=${riyadhToday()}&to=${riyadhToday()}`);
      setExpenses(result.expenses);
      setTotalAmount(result.totalAmount);
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : tr(locale,"Expenses could not be loaded","تعذر تحميل المصروفات"));
    } finally {
      setLoading(false);
    }
  }, [reportError, locale]);
  useEffect(() => {
    // Initial expense synchronization with the backend.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/api/expenses", { method: "POST", body: JSON.stringify(form) });
      setFormOpen(false);
      setForm((current) => ({ ...current, description: "", amount: 0, vendor: "", receiptReference: "", notes: "" }));
      await load();
    } catch (caught) {
      reportError(caught instanceof Error ? caught.message : tr(locale,"Expense could not be saved","تعذر حفظ المصروف"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="expense-workspace no-print">
      <header><div><p>{tr(locale,"EXPENSES","المصروفات")}</p><h1>{tr(locale,"Daily operating costs","تكاليف التشغيل اليومية")}</h1><span>{tr(locale,"Record and review today’s shop expenses.","سجّل وراجع مصروفات المتجر اليوم.")}</span></div><div className="expense-total"><span>{tr(locale,"TODAY","اليوم")}</span><b>SAR {sar.format(totalAmount)}</b></div><button onClick={() => setFormOpen(true)}>+ {tr(locale,"Add expense","إضافة مصروف")}</button></header>
      <div className="expense-table-card"><table><thead><tr><th>{tr(locale,"Reference","المرجع")}</th><th>{tr(locale,"Category","الفئة")}</th><th>{tr(locale,"Description","الوصف")}</th><th>{tr(locale,"Vendor","المورد")}</th><th>{tr(locale,"Method","الطريقة")}</th><th>{tr(locale,"Amount","المبلغ")}</th><th>{tr(locale,"Status","الحالة")}</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td><b>{expense.expenseNumber}</b><span>{expense.expenseDate}</span></td><td>{expense.category}</td><td>{expense.description}</td><td>{expense.vendor || "—"}</td><td><span className="expense-method">{expense.paymentMethod}</span></td><td><b>SAR {sar.format(Number(expense.amount))}</b></td><td><span className={`expense-status ${expense.status}`}>{expense.status}</span></td></tr>)}{!expenses.length && !loading && <tr><td colSpan={7}><div className="office-empty">{tr(locale,"No expenses recorded today.","لا توجد مصروفات مسجلة اليوم.")}</div></td></tr>}{loading && <tr><td colSpan={7}><div className="office-empty">{tr(locale,"Loading expenses…","جارٍ تحميل المصروفات…")}</div></td></tr>}</tbody></table></div>
      {formOpen && <div className="office-modal-backdrop" onMouseDown={() => setFormOpen(false)}><form className="expense-form" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><header><div><p>{tr(locale,"NEW EXPENSE","مصروف جديد")}</p><h2>{tr(locale,"Add operating cost","إضافة تكلفة تشغيل")}</h2></div><button type="button" onClick={() => setFormOpen(false)}>×</button></header><div className="expense-form-grid"><label>{tr(locale,"Date","التاريخ")}<input type="date" value={form.expenseDate} onChange={(event) => setForm({ ...form, expenseDate: event.target.value })} required /></label><label>{tr(locale,"Category","الفئة")}<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Utilities</option><option>Supplies</option><option>Maintenance</option><option>Transport</option><option>Rent</option><option>Payroll</option><option>Other</option></select></label><label className="wide">{tr(locale,"Description","الوصف")}<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></label><label>{tr(locale,"Amount (SAR)","المبلغ (ر.س)")}<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} required /></label><label>{tr(locale,"Payment","الدفع")}<select value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value })}><option value="cash">{tr(locale,"Cash","نقدي")}</option><option value="card">{tr(locale,"Card","بطاقة")}</option><option value="bank">{tr(locale,"Bank","تحويل بنكي")}</option></select></label><label>{tr(locale,"Vendor","المورد")}<input value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} /></label><label>{tr(locale,"Receipt reference","مرجع الإيصال")}<input value={form.receiptReference} onChange={(event) => setForm({ ...form, receiptReference: event.target.value })} /></label><label className="wide">{tr(locale,"Notes","ملاحظات")}<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label></div><footer><button type="button" onClick={() => setFormOpen(false)}>{tr(locale,"Cancel","إلغاء")}</button><button className="primary" disabled={saving}>{saving ? tr(locale,"Saving…","جارٍ الحفظ…") : tr(locale,"Save expense","حفظ المصروف")}</button></footer></form></div>}
    </section>
  );
}

function OrderDetailModal({ detail, locale, onClose, onSaved, onPrint, reportError }: { detail: OrderDetail; locale: Locale; onClose: () => void; onSaved: (detail: OrderDetail) => Promise<void>; onPrint: (detail: OrderDetail) => void; reportError: (message: string) => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  const order = detail.order;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">(order.paymentMethod);
  const [cardAccount, setCardAccount] = useState<"stc" | "anb">(order.cardAccount ?? "stc");
  const [cashReceived, setCashReceived] = useState(Number(order.cashReceived));
  const [cardAmount, setCardAmount] = useState(order.paymentStatus === "unpaid" ? Number(order.totalAmount) : Number(order.amountPaid));
  const [settled, setSettled] = useState(Boolean(order.balanceSettledByStaff));
  const [fromStaff, setFromStaff] = useState(Number(order.settledFromStaff));
  const [fromDrawer, setFromDrawer] = useState(Number(order.settledFromDrawer));
  const [notes, setNotes] = useState(order.notes ?? "");

  function changePaymentMethod(method: "cash" | "card") {
    setPaymentMethod(method);
    if (method === "card" && order.paymentStatus === "unpaid") {
      setCardAmount(Number(order.totalAmount));
    }
  }

  async function saveChanges() {
    setSaving(true);
    try {
      const result = await api<{ detail: OrderDetail }>("/api/orders", {
        method: "PATCH",
        body: JSON.stringify({
          id: order.id,
          version: order.version,
          paymentMethod,
          cardAccount: paymentMethod === "card" ? cardAccount : null,
          amountPaid: paymentMethod === "card" ? cardAmount : undefined,
          cashReceived: paymentMethod === "cash" ? cashReceived : 0,
          balanceSettledByStaff: paymentMethod === "cash" && settled,
          settledFromStaff: paymentMethod === "cash" && settled ? fromStaff : 0,
          settledFromDrawer: paymentMethod === "cash" && settled ? fromDrawer : 0,
          notes,
        }),
      });
      await onSaved(result.detail);
      setEditing(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        const result = await api<{ status: string }>("/api/permissions", { method: "POST", body: JSON.stringify({ task: "order_update", resourceType: "order", resourceId: String(order.id), reason: `Update order ${order.tokenNumber}` }) });
        reportError(tr(locale, `Update permission request is ${result.status}.`, `حالة طلب صلاحية التعديل: ${result.status}.`));
      } else reportError(caught instanceof Error ? caught.message : tr(locale, "Order could not be updated.", "تعذر تحديث الطلب."));
    } finally {
      setSaving(false);
    }
  }

  return <div className="order-detail-backdrop no-print" onMouseDown={onClose} role="presentation"><section ref={dialogRef} tabIndex={-1} className="order-detail-modal" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
    if (event.key === "Escape" && !saving) onClose();
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]'));
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} role="dialog" aria-modal="true" aria-labelledby="order-detail-title">
    <header><div><p>{tr(locale,"ORDER DETAILS","تفاصيل الطلب")}</p><h2 id="order-detail-title">{order.tokenNumber}</h2><span>{order.invoiceNumber}</span></div><div className="order-detail-header-actions"><span className={`order-status ${order.paymentStatus}`}>{tr(locale, order.paymentStatus, order.paymentStatus === "paid" ? "مدفوع" : order.paymentStatus === "partial" ? "جزئي" : "غير مدفوع")}</span><button aria-label={tr(locale,"Close details","إغلاق التفاصيل")} onClick={onClose}>×</button></div></header>
    <div className="order-detail-body">
      <section className="order-detail-facts"><article><span>{tr(locale,"Customer","العميل")}</span><b>{order.customerName}</b><small>{order.customerPhone || "—"}</small><small>{order.customerEmail || "—"}</small><small>{order.customerAddress || "—"}</small></article><article><span>{tr(locale,"Handled by","الموظف المسؤول")}</span><b>{order.assignedStaffName}</b><small>{tr(locale,"Created by","أنشأه")} {order.createdByName}</small></article><article><span>{tr(locale,"Order date","تاريخ الطلب")}</span><b>{order.orderDate}</b><small>{tr(locale,"Supply date","تاريخ التسليم")} {order.supplyDate}</small><small>{new Date(order.createdAt).toLocaleString(locale === "ar" ? "ar-SA" : "en-SA")}</small></article></section>
      <section className="order-detail-items"><header><h3>{tr(locale,"Items","العناصر")}</h3><span>{detail.items.reduce((sum, item) => sum + Number(item.quantity), 0)} {tr(locale,"pieces","قطع")}</span></header>{detail.items.map((item, index) => <div key={`${item.serviceId}-${index}`}><span><b>{item.serviceName}</b><small>{item.categoryName}</small></span><span>{item.quantity} × SAR {sar.format(Number(item.unitPrice))}</span><strong>SAR {sar.format(Number(item.totalAmount))}</strong></div>)}</section>
      <section className="order-detail-payment"><header><h3>{tr(locale,"Payment & collection","الدفع والتحصيل")}</h3>{!editing && <button onClick={() => setEditing(true)}>{tr(locale,"Update","تعديل")}</button>}</header>{editing ? <div className="order-edit-grid"><label>{tr(locale,"Method","الطريقة")}<select value={paymentMethod} onChange={(event) => changePaymentMethod(event.target.value as "cash" | "card")}><option value="card">{tr(locale,"Card","بطاقة")}</option><option value="cash">{tr(locale,"Cash","نقدي")}</option></select></label>{paymentMethod === "card" ? <><label>{tr(locale,"Receiving account","الحساب المستلم")}<select value={cardAccount} onChange={(event) => setCardAccount(event.target.value as "stc" | "anb")}><option value="stc">STC</option><option value="anb">ANB</option></select></label><label>{tr(locale,"Card amount","مبلغ البطاقة")}<input type="number" min="0" max={order.totalAmount} step="0.01" value={cardAmount} onChange={(event) => setCardAmount(Number(event.target.value))} /><small>{tr(locale,"Pre-filled with the full bill amount; edit for a partial payment.","تم تعبئته بإجمالي الفاتورة؛ عدّله للدفع الجزئي.")}</small></label></> : <><label>{tr(locale,"Cash received","النقد المستلم")}<input type="number" min="0" max={order.totalAmount} step="0.01" value={cashReceived} onChange={(event) => setCashReceived(Number(event.target.value))} /></label><label className="detail-cash-check"><input type="checkbox" checked={settled} onChange={(event) => setSettled(event.target.checked)} /><span>{tr(locale,"Balance settled by staff","تمت تسوية الرصيد بواسطة الموظف")}</span></label>{settled && <><label>{tr(locale,"From staff","من الموظف")}<input type="number" min="0" step="0.01" value={fromStaff} onChange={(event) => setFromStaff(Number(event.target.value))} /></label><label>{tr(locale,"From drawer / wallet","من الدرج / المحفظة")}<input type="number" min="0" step="0.01" value={fromDrawer} onChange={(event) => setFromDrawer(Number(event.target.value))} /></label></>}</>}<label className="wide">{tr(locale,"Notes","ملاحظات")}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div> : <div className="order-payment-summary"><span><small>{tr(locale,"Method","الطريقة")}</small><b>{order.paymentMethod === "card" ? `Card · ${(order.cardAccount ?? "stc").toUpperCase()}` : tr(locale,"Cash","نقدي")}</b></span><span><small>{tr(locale,"Total","الإجمالي")}</small><b>SAR {sar.format(Number(order.totalAmount))}</b></span><span><small>{tr(locale,"Collected","المحصّل")}</small><b>SAR {sar.format(Number(order.amountPaid))}</b></span><span><small>{tr(locale,"Balance","الرصيد")}</small><b>SAR {sar.format(Number(order.balance))}</b></span>{order.notes && <p>{order.notes}</p>}</div>}</section>
      <details className="order-audit"><summary>{tr(locale,"Activity history","سجل النشاط")} ({detail.events.length})</summary>{detail.events.map((event) => <div key={event.id}><b>{event.eventType.replaceAll("_", " ")}</b><span>{event.actorName} · {new Date(event.createdAt).toLocaleString(locale === "ar" ? "ar-SA" : "en-SA")}</span></div>)}</details>
    </div>
    <footer>{editing ? <><button onClick={() => setEditing(false)}>{tr(locale,"Cancel","إلغاء")}</button><button className="primary" disabled={saving} onClick={() => void saveChanges()}>{saving ? tr(locale,"Saving…","جارٍ الحفظ…") : tr(locale,"Save changes","حفظ التعديلات")}</button></> : <><button onClick={onClose}>{tr(locale,"Close","إغلاق")}</button><button className="primary" onClick={() => onPrint(detail)}>{tr(locale,"Print bill","طباعة الفاتورة")}</button></>}</footer>
  </section></div>;
}

function CollectionWorkspace({ locale, reportError, openOrder }: { locale: Locale; reportError: (message: string) => void; openOrder: (id: number) => Promise<void> }) {
  const [date, setDate] = useState(riyadhToday());
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState({ sales: 0, collected: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [requestStatus, setRequestStatus] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editPaid, setEditPaid] = useState(0);
  const [editMethod, setEditMethod] = useState<"card" | "cash">("cash");
  const [editBank, setEditBank] = useState<"stc" | "anb">("stc");

  const load = useCallback(async () => {
    setLoading(true);
    setNeedsPermission(false);
    try {
      const result = await api<{ orders: Order[]; summary: { sales: number; collected: number; balance: number } }>(`/api/orders?from=${date}&to=${date}&pageSize=100`);
      setOrders(result.orders);
      setSummary(result.summary);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) setNeedsPermission(true);
      else reportError(caught instanceof Error ? caught.message : tr(locale, "Collection report could not be loaded.", "تعذر تحميل تقرير التحصيل."));
    } finally { setLoading(false); }
  }, [date, locale, reportError]);
  useEffect(() => {
    // Synchronize the selected business date.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function requestCollectionAccess() {
    const result = await api<{ status: string }>("/api/permissions", { method: "POST", body: JSON.stringify({ task: "collection_read", resourceType: "collection_date", resourceId: date, reason: `Review daily collection for ${date}` }) });
    setRequestStatus(result.status);
  }

  function beginEdit(order: Order) {
    setEditing(order.id);
    setEditPaid(order.paymentStatus === "unpaid" && order.paymentMethod === "card" ? Number(order.totalAmount) : Number(order.amountPaid));
    setEditMethod(order.paymentMethod);
    setEditBank(order.cardAccount ?? "stc");
  }

  function changeCollectionMethod(order: Order, method: "card" | "cash") {
    setEditMethod(method);
    if (method === "card" && order.paymentStatus === "unpaid") {
      setEditPaid(Number(order.totalAmount));
    }
  }

  async function saveEdit(order: Order) {
    try {
      await api("/api/orders", { method: "PATCH", body: JSON.stringify({ id: order.id, version: order.version, amountPaid: editPaid, cashReceived: editMethod === "cash" ? editPaid : 0, paymentMethod: editMethod, cardAccount: editMethod === "card" ? editBank : null }) });
      setEditing(null);
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        const result = await api<{ status: string }>("/api/permissions", { method: "POST", body: JSON.stringify({ task: "order_update", resourceType: "order", resourceId: String(order.id), reason: `Correct payment for ${order.tokenNumber}` }) });
        reportError(tr(locale, `Task-specific update request is ${result.status}.`, `حالة طلب تعديل هذا الطلب: ${result.status}.`));
      } else reportError(caught instanceof Error ? caught.message : tr(locale, "Collection could not be updated.", "تعذر تحديث التحصيل."));
    }
  }

  async function cancelOrder(order: Order) {
    if (!window.confirm(tr(locale, `Cancel order ${order.tokenNumber}? It will be removed from collections, while its audit history is retained.`, `إلغاء الطلب ${order.tokenNumber}؟ سيُزال من التحصيل مع الاحتفاظ بسجل التدقيق.`))) return;
    try {
      await api("/api/orders", { method: "DELETE", body: JSON.stringify({ id: order.id, version: order.version }) });
      await load();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        const result = await api<{ status: string }>("/api/permissions", { method: "POST", body: JSON.stringify({ task: "order_update", resourceType: "order", resourceId: String(order.id), reason: `Void order ${order.tokenNumber}` }) });
        reportError(tr(locale, `Task-specific cancellation request is ${result.status}.`, `حالة طلب إلغاء هذا الطلب: ${result.status}.`));
      } else reportError(caught instanceof Error ? caught.message : tr(locale, "Order could not be voided.", "تعذر إلغاء الطلب."));
    }
  }

  return <section className="collection-workspace no-print"><header><div><p>{tr(locale,"DAILY COLLECTION","التحصيل اليومي")}</p><h1>{tr(locale,"Collection report","تقرير التحصيل")}</h1><span>{tr(locale,"Today is editable. Older task changes require admin approval.","يمكن تعديل اليوم. المهام الأقدم تحتاج موافقة الإدارة.")}</span></div><label>{tr(locale,"Business date","تاريخ العمل")}<input type="date" max={riyadhToday()} value={date} onChange={(event) => setDate(event.target.value)} /></label></header>{needsPermission ? <div className="permission-gate"><b>{tr(locale,"Admin permission required","مطلوب إذن الإدارة")}</b><p>{tr(locale,"Request read-only access for this specific collection date.","اطلب صلاحية قراءة لهذا التاريخ فقط.")}</p><button disabled={Boolean(requestStatus)} onClick={requestCollectionAccess}>{requestStatus ? tr(locale,`Request ${requestStatus}`,`الطلب ${requestStatus}`) : tr(locale,"Request access","طلب الصلاحية")}</button></div> : <><div className="collection-metrics"><article><span>{tr(locale,"Sales","المبيعات")}</span><b>SAR {sar.format(Number(summary.sales))}</b></article><article><span>{tr(locale,"Collected","المحصّل")}</span><b>SAR {sar.format(Number(summary.collected))}</b></article><article><span>{tr(locale,"Outstanding","المتبقي")}</span><b>SAR {sar.format(Number(summary.balance))}</b></article></div><div className="collection-table"><table><thead><tr><th>{tr(locale,"Token","الرمز")}</th><th>{tr(locale,"Customer","العميل")}</th><th>{tr(locale,"Method/account","الطريقة/الحساب")}</th><th>{tr(locale,"Total","الإجمالي")}</th><th>{tr(locale,"Collected","المحصّل")}</th><th>{tr(locale,"Balance","الرصيد")}</th><th>{tr(locale,"Action","الإجراء")}</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.tokenNumber}</strong><small>{order.invoiceNumber}</small></td><td>{order.customerName}</td><td>{editing === order.id ? <div className="collection-edit-method"><select value={editMethod} onChange={(event) => changeCollectionMethod(order, event.target.value as "card" | "cash")}><option value="card">{tr(locale,"Card","بطاقة")}</option><option value="cash">{tr(locale,"Cash","نقدي")}</option></select>{editMethod === "card" && <select value={editBank} onChange={(event) => setEditBank(event.target.value as "stc" | "anb")}><option value="stc">STC</option><option value="anb">ANB</option></select>}</div> : <span>{order.paymentMethod === "card" ? `Card · ${(order.cardAccount ?? "stc").toUpperCase()}` : tr(locale,"Cash","نقدي")}</span>}</td><td>SAR {sar.format(Number(order.totalAmount))}</td><td>{editing === order.id ? <input className="collection-paid-input" type="number" min="0" max={order.totalAmount} step="0.01" value={editPaid} onChange={(event) => setEditPaid(Number(event.target.value))} /> : `SAR ${sar.format(Number(order.amountPaid))}`}</td><td>SAR {sar.format(Number(order.balance))}</td><td>{editing === order.id ? <div className="collection-row-actions"><button onClick={() => saveEdit(order)}>{tr(locale,"Save","حفظ")}</button><button onClick={() => setEditing(null)}>{tr(locale,"Cancel","إلغاء")}</button></div> : <div className="collection-row-actions"><button onClick={() => void openOrder(order.id)}>{tr(locale,"Details","التفاصيل")}</button><button onClick={() => beginEdit(order)}>{tr(locale,"Edit payment","تعديل الدفع")}</button><button className="danger" onClick={() => void cancelOrder(order)}>{tr(locale,"Cancel order","إلغاء الطلب")}</button></div>}</td></tr>)}{!orders.length && !loading && <tr><td colSpan={7}>{tr(locale,"No collections for this date.","لا توجد عمليات تحصيل لهذا التاريخ.")}</td></tr>}{loading && <tr><td colSpan={7}>{tr(locale,"Loading…","جارٍ التحميل…")}</td></tr>}</tbody></table></div></>}</section>;
}
