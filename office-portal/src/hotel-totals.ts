import { roundMoney } from "../../lib/invoice";

/** Hotel invoices sum VAT rounded per delivery line, including at draft time. */
export function hotelDraftTotals(lines: Array<{ quantity: number; unitPrice: number }>) {
  const rounded = lines.map((line) => {
    const subtotal = roundMoney(line.quantity * line.unitPrice);
    return { subtotal, vatAmount: roundMoney(subtotal * 0.15) };
  });
  const subtotal = roundMoney(rounded.reduce((sum, line) => sum + line.subtotal, 0));
  const vatAmount = roundMoney(rounded.reduce((sum, line) => sum + line.vatAmount, 0));
  return { subtotal, vatAmount, totalAmount: roundMoney(subtotal + vatAmount) };
}
