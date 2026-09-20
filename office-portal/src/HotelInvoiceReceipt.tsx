"use client";

import { QRCodeSVG } from "qrcode.react";
import type { HotelInvoice } from "../../contracts/src/hotels";
import { vatQrPayload } from "../../lib/invoice";
import "./hotel-invoice.css";

const amount = (value: number) => value.toFixed(2);
export default function HotelInvoiceReceipt({ invoice }: { invoice: HotelInvoice }) {
  const { hotel, seller } = invoice;
  const qr = vatQrPayload({ seller: seller.shopName, vatNumber: seller.vatNumber, timestamp: invoice.issuedAt, total: invoice.totalAmount, vat: invoice.vatAmount });
  const date = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Riyadh",dateStyle:"medium",timeStyle:"short"}).format(new Date(invoice.issuedAt));
  return <article className="hotel-invoice" dir="ltr" lang="en">
    <header className="hotel-invoice-heading"><section><h1>{seller.shopName}</h1><b dir="rtl">{seller.shopNameAr}</b><p>{seller.address || "Riyadh, Saudi Arabia"}</p><p>{seller.phone}</p><p><strong>VAT</strong> {seller.vatNumber}</p></section><section className="hotel-invoice-identity"><QRCodeSVG value={qr} size={105} level="M" marginSize={2}/><small>VAT invoice QR<br/>رمز الفاتورة الضريبية</small></section></header>
    <div className="hotel-invoice-title"><b>Tax invoice</b><b dir="rtl">فاتورة ضريبية</b></div>
    <div className="hotel-invoice-meta"><div><span>Invoice no. / رقم الفاتورة</span><strong>{invoice.invoiceNumber}</strong></div><div><span>Issue date / تاريخ الإصدار</span><strong>{date}</strong></div><div><span>Supply date / تاريخ التوريد</span><strong>{invoice.items[0]?.deliveryDate ?? invoice.month}</strong></div><div><span>Hotel code / رمز الفندق</span><strong>{hotel.code}</strong></div></div>
    <div className="hotel-invoice-parties"><section><h3>Seller / المورد</h3><dl><dt>Name / الاسم</dt><dd>{seller.shopName}<br/><span dir="rtl">{seller.shopNameAr}</span></dd><dt>Address / العنوان</dt><dd>{seller.address || "—"}</dd><dt>VAT no. / الرقم الضريبي</dt><dd>{seller.vatNumber}</dd><dt>Contact / رقم الاتصال</dt><dd>{seller.phone || "—"}</dd></dl></section><section><h3>Buyer / العميل</h3><dl><dt>Name / الاسم</dt><dd dir="auto"><strong>{hotel.name}</strong></dd><dt>Hotel code / رمز الفندق</dt><dd>{hotel.code}</dd><dt>Address / العنوان</dt><dd dir="auto">{hotel.address || "—"}</dd><dt>Postal code / الرمز البريدي</dt><dd>{hotel.postalCode || "—"}</dd><dt>Additional no. / الرقم الإضافي</dt><dd>{hotel.additionalNumber || "—"}</dd><dt>VAT no. / الرقم الضريبي</dt><dd>{hotel.vatNumber || "—"}</dd><dt>Contact / رقم الاتصال</dt><dd>{hotel.phone || "—"}</dd></dl></section></div>
    <table className="hotel-invoice-lines">
      <thead><tr><th>Service / الخدمة</th><th>Rate<br/>السعر</th><th>Qty<br/>الكمية</th><th>Taxable<br/>المبلغ الخاضع</th><th>Discount<br/>الخصم</th><th>VAT %<br/>نسبة الضريبة</th><th>VAT<br/>الضريبة</th><th>Total<br/>الإجمالي</th></tr></thead>
      <tbody>{invoice.items.map((item,index)=><tr key={item.id ?? index}><td><strong>{item.serviceName}</strong><small>{item.deliveryDate} · {item.token}</small></td><td>{amount(item.unitPrice)}</td><td>{item.quantity}</td><td>{amount(item.taxableAmount)}</td><td>0.00</td><td>15%</td><td>{amount(item.vatAmount)}</td><td>{amount(item.totalAmount)}</td></tr>)}</tbody>
    </table>
    <div className="hotel-invoice-bottom">
      <p>Amounts in Saudi Riyals (SAR).<br/>جميع المبالغ بالريال السعودي<br/>Delivery references above identify the supply dates.<br/>تواريخ التوريد موضحة في بنود التسليم أعلاه</p>
      <dl><dt>Total excluding VAT / الإجمالي قبل الضريبة</dt><dd>{amount(invoice.subtotal)}</dd><dt>Discount / الخصم</dt><dd>0.00</dd><dt>VAT 15% / ضريبة القيمة المضافة</dt><dd>{amount(invoice.vatAmount)}</dd><dt className="grand">Total including VAT / الإجمالي</dt><dd className="grand">{amount(invoice.totalAmount)}</dd><dt>Paid / المدفوع</dt><dd>{amount(invoice.amountPaid)}</dd><dt>Balance / المتبقي</dt><dd>{amount(invoice.balance)}</dd></dl>
    </div>
    <footer><p>{seller.receiptFooter || "Thank you for choosing our laundry service."}</p><p><strong>Payment notice:</strong> Please clear this invoice within 25 days of its issue date.</p><p dir="rtl"><strong>تنبيه السداد:</strong> يرجى سداد هذه الفاتورة خلال 25 يوماً من تاريخ إصدارها.</p></footer>
  </article>;
}
