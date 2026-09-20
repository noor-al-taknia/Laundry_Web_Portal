import type { Shop, OrderItem } from "./index";

export type HotelCustomer = {
  id: number; code: string; name: string; address: string; postalCode: string;
  additionalNumber: string; vatNumber: string; otherId: string; phone: string;
  isActive: boolean; version: number;
};
export type HotelDelivery = {
  id: number; token: string; hotelId: number; hotelCode: string; hotelName: string;
  deliveryDate: string; status: "active" | "cancelled"; invoiceId: number | null;
  notes: string; subtotal: number; vatAmount: number; totalAmount: number;
  version: number; createdByName: string; assignedStaffName: string; assignedStaffId: number;
  createdAt: string; items: OrderItem[];
};
export type HotelInvoice = {
  id: number; invoiceNumber: string; hotelId: number; month: string; deliveryId: number | null; issuedAt: string;
  hotel: HotelCustomer; seller: Shop; subtotal: number; vatAmount: number; totalAmount: number;
  amountPaid: number; balance: number; paymentStatus: "paid" | "unpaid" | "partial"; version: number;
  items: Array<OrderItem & { deliveryDate: string; token: string }>;
  payments: Array<{ id: number; amount: number; method: "cash" | "card"; account: string | null; createdAt: string; actorName: string }>;
};
