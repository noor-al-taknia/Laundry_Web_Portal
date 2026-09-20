import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
});

import { useOfficeStore } from "../office-portal/src/store";

const service = { serviceId: 17, serviceName: "Shirt", categoryName: "Clothes", categoryColor: "#123456", quantity: 1, unitPrice: 4 };

beforeEach(() => { useOfficeStore.getState().bindUser(null); useOfficeStore.getState().bindUser(10); });

describe("Office draft integrity", () => {
  it("keeps invoice-only rates without mutating the catalog object", () => {
    const store = useOfficeStore.getState();
    store.addItem(service);
    store.setUnitPrice(17, 6.25);
    store.addItem(service);
    expect(useOfficeStore.getState().cart[0]).toMatchObject({ quantity: 2, unitPrice: 6.25 });
    expect(service.unitPrice).toBe(4);
  });

  it("allows manual integer quantities and removes a line at zero", () => {
    useOfficeStore.getState().addItem(service);
    useOfficeStore.getState().setQuantity(17, 25);
    expect(useOfficeStore.getState().cart[0].quantity).toBe(25);
    useOfficeStore.getState().setQuantity(17, 0);
    expect(useOfficeStore.getState().cart).toEqual([]);
  });

  it("rejects non-finite, negative, fractional, or excessive quantities and prices", () => {
    const store = useOfficeStore.getState();
    store.addItem(service);
    for (const quantity of [NaN, Infinity, -1, 1.5, 100000]) store.setQuantity(17, quantity);
    for (const price of [NaN, Infinity, -1, 1000000]) store.setUnitPrice(17, price);
    expect(useOfficeStore.getState().cart[0]).toMatchObject({ quantity: 1, unitPrice: 4 });
  });

  it("retains the same user's draft but clears it when another user signs in", () => {
    const store = useOfficeStore.getState();
    store.addItem(service);
    store.setCustomer({ id: 1, name: "Customer A", phone: "123" });
    store.bindUser(10);
    expect(useOfficeStore.getState().cart).toHaveLength(1);
    store.bindUser(11);
    expect(useOfficeStore.getState().cart).toEqual([]);
    expect(useOfficeStore.getState().customer.name).toBe("");
    expect(useOfficeStore.getState().ownerId).toBe(11);
  });

  it("clears customer and invoice data on logout", () => {
    useOfficeStore.getState().addItem(service);
    useOfficeStore.getState().setCustomer({ name: "Private customer" });
    useOfficeStore.getState().bindUser(null);
    expect(useOfficeStore.getState().cart).toEqual([]);
    expect(useOfficeStore.getState().customer.name).toBe("");
    expect(useOfficeStore.getState().ownerId).toBeNull();
  });
});
