"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CartItem, Customer } from "../../contracts/src";

type OfficeSection = "sales" | "expenses" | "collections";
type CustomerDraft = Pick<Customer, "name" | "phone" | "email" | "address"> & {
  id: number | null;
  query: string;
};

const emptyCustomer: CustomerDraft = {
  id: null,
  query: "",
  name: "",
  phone: "",
  email: "",
  address: "",
};

type OfficeState = {
  ownerId: number | null;
  section: OfficeSection;
  categoryId: number | null;
  cart: CartItem[];
  customer: CustomerDraft;
  setSection: (section: OfficeSection) => void;
  setCategoryId: (id: number) => void;
  addItem: (item: CartItem) => void;
  setQuantity: (serviceId: number, quantity: number) => void;
  setUnitPrice: (serviceId: number, unitPrice: number) => void;
  bindUser: (userId: number | null) => void;
  setCustomer: (values: Partial<CustomerDraft>) => void;
  resetSale: () => void;
};

export const useOfficeStore = create<OfficeState>()(
  persist(
    (set) => ({
      ownerId: null,
      section: "sales",
      categoryId: null,
      cart: [],
      customer: emptyCustomer,
      setSection: (section) => set({ section }),
      setCategoryId: (categoryId) => set({ categoryId }),
      addItem: (incoming) =>
        set((state) => {
          if (!Number.isSafeInteger(incoming.quantity) || incoming.quantity <= 0 || incoming.quantity > 99999 || !Number.isFinite(incoming.unitPrice) || incoming.unitPrice <= 0) return state;
          const exists = state.cart.some((item) => item.serviceId === incoming.serviceId);
          return {
            cart: exists
              ? state.cart.map((item) =>
                  item.serviceId === incoming.serviceId
                    ? { ...item, quantity: Math.min(99999, item.quantity + 1) }
                    : item,
                )
              : [...state.cart, incoming],
          };
        }),
      setQuantity: (serviceId, quantity) =>
        set((state) => !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 99999 ? state : ({
          cart:
            quantity <= 0
              ? state.cart.filter((item) => item.serviceId !== serviceId)
              : state.cart.map((item) =>
                  item.serviceId === serviceId ? { ...item, quantity } : item,
                ),
        })),
      setUnitPrice: (serviceId, unitPrice) =>
        set((state) => !Number.isFinite(unitPrice) || unitPrice < 0.01 || unitPrice > 999999.99 ? state : ({
          cart: state.cart.map((item) => item.serviceId === serviceId ? { ...item, unitPrice: Math.round((unitPrice + Number.EPSILON) * 100) / 100 } : item),
        })),
      bindUser: (ownerId) => set((state) => state.ownerId === ownerId && ownerId !== null ? state : ({
        ownerId, section: "sales", categoryId: null, cart: [], customer: { ...emptyCustomer },
      })),
      setCustomer: (values) =>
        set((state) => ({ customer: { ...state.customer, ...values } })),
      resetSale: () => set({ cart: [], customer: emptyCustomer }),
    }),
    {
      name: "laundry-office-draft-v3",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ ownerId: state.ownerId, cart: state.cart, customer: state.customer }),
    },
  ),
);
