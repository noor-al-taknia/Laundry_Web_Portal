import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
});

import { hotelRequestKey, useHotelStore } from "../office-portal/src/hotel-store";
import { useOfficeStore } from "../office-portal/src/store";
import { hotelDraftTotals } from "../office-portal/src/hotel-totals";
import type { HotelCustomer } from "../contracts/src/hotels";

const hotel: HotelCustomer = { id: 1, code: "a1a2", name: "Hotel A", address: "Riyadh", phone: "", vatNumber: "", postalCode: "", additionalNumber: "", otherId: "", version: 1, isActive: true };
const line = { serviceId: 21, serviceName: "Towel", categoryName: "Hotel linen", categoryColor: "#2563eb", quantity: 1, unitPrice: 2 };
beforeEach(() => {
  useHotelStore.getState().bindUser(null); useHotelStore.getState().bindUser(11); useHotelStore.getState().selectHotel(hotel);
  useOfficeStore.getState().bindUser(null); useOfficeStore.getState().bindUser(11);
});

describe("Hotel draft and request isolation", () => {
  it("never changes the walk-in draft when creating hotel deliveries", () => {
    useOfficeStore.getState().setCustomer({ name: "Walk-in buyer" }); useOfficeStore.getState().addItem({ ...line, serviceId: 22 });
    useHotelStore.getState().addItem(line); useHotelStore.getState().setLine(21, { unitPrice: 3.25, quantity: 12 });
    expect(useOfficeStore.getState().cart[0]).toMatchObject({ serviceId: 22, unitPrice: 2, quantity: 1 });
    expect(useOfficeStore.getState().customer.name).toBe("Walk-in buyer");
    expect(useHotelStore.getState().cart[0]).toMatchObject({ unitPrice: 3.25, quantity: 12 });
  });
  it("keeps the same request key through a retry and replaces it for the next delivery", () => {
    useHotelStore.getState().addItem(line); const key = useHotelStore.getState().requestKey;
    useHotelStore.getState().setLine(21, { quantity: 7 }); expect(useHotelStore.getState().requestKey).toBe(key);
    expect(key).toMatch(/^[a-zA-Z0-9_-]{16,100}$/);
    useHotelStore.getState().resetDelivery(); expect(useHotelStore.getState().requestKey).not.toBe(key);
    expect(useHotelStore.getState().cart).toHaveLength(0);
    expect(useHotelStore.getState().hotel?.id).toBe(1);
  });
  it("resets an unsaved delivery when a different hotel is selected", () => {
    useHotelStore.getState().addItem(line); useHotelStore.getState().setNotes("Private note");
    useHotelStore.getState().selectHotel({ ...hotel, id: 2, code: "b1b2" });
    expect(useHotelStore.getState().cart).toEqual([]); expect(useHotelStore.getState().notes).toBe("");
  });
  it("updates selected hotel metadata without losing the same hotel's draft", () => {
    useHotelStore.getState().addItem(line); useHotelStore.getState().selectHotel({ ...hotel, address: "New address" });
    expect(useHotelStore.getState().cart).toHaveLength(1); expect(useHotelStore.getState().hotel?.address).toBe("New address");
  });
  it("clears hotel personal data and draft on user change or logout", () => {
    useHotelStore.getState().addItem(line); useHotelStore.getState().bindUser(12);
    expect(useHotelStore.getState().hotel).toBeNull(); expect(useHotelStore.getState().cart).toEqual([]);
    useHotelStore.getState().selectHotel(hotel); useHotelStore.getState().bindUser(null);
    expect(useHotelStore.getState().hotel).toBeNull(); expect(useHotelStore.getState().requestKey).toBe("");
  });
  it("rejects invalid numeric values and protects the source price", () => {
    const store = useHotelStore.getState(); store.addItem(line);
    for (const unitPrice of [0, -1, NaN, Infinity, 1000000]) store.setLine(21, { unitPrice });
    for (const quantity of [-1, 1.5, Infinity, NaN, 100000]) store.setLine(21, { quantity });
    expect(useHotelStore.getState().cart[0]).toMatchObject({ unitPrice: 2, quantity: 1 });
    store.setLine(21, { unitPrice: 3.456 }); expect(useHotelStore.getState().cart[0].unitPrice).toBe(3.46); expect(line.unitPrice).toBe(2);
  });
  it("generates unique API-compatible delivery and payment keys without requiring HTTPS randomUUID", () => {
    const keys = Array.from({ length: 30 }, hotelRequestKey);
    expect(new Set(keys).size).toBe(30); for (const key of keys) expect(key).toMatch(/^[a-zA-Z0-9_-]{16,100}$/);
  });
});

describe("Hotel preview reconciliation", () => {
  it("sums rounded per-line VAT instead of rounding aggregate VAT", () => {
    expect(hotelDraftTotals([{ quantity: 1, unitPrice: 0.03 }, { quantity: 1, unitPrice: 0.03 }])).toEqual({ subtotal: 0.06, vatAmount: 0, totalAmount: 0.06 });
  });
  it("keeps delivery line and monthly invoice arithmetic exact to cents", () => {
    expect(hotelDraftTotals([{ quantity: 3, unitPrice: 1.5 }, { quantity: 2, unitPrice: 12 }])).toEqual({ subtotal: 28.5, vatAmount: 4.28, totalAmount: 32.78 });
  });
});
