"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CartItem } from "../../contracts/src";
import type { HotelCustomer } from "../../contracts/src/hotels";

export function hotelRequestKey() {
  return `hotel-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(4))).map((part) => part.toString(16)).join("")}`;
}

type HotelDraft = {
  ownerId: number | null; hotel: HotelCustomer | null; cart: CartItem[]; notes: string; requestKey: string;
  bindUser: (id: number | null) => void; selectHotel: (hotel: HotelCustomer) => void;
  addItem: (item: CartItem) => void; setLine: (id: number, values: Partial<Pick<CartItem, "quantity" | "unitPrice">>) => void;
  setNotes: (notes: string) => void; resetDelivery: () => void;
};

export const useHotelStore = create<HotelDraft>()(persist((set) => ({
  ownerId: null, hotel: null, cart: [], notes: "", requestKey: "",
  bindUser: (ownerId) => set((state) => state.ownerId === ownerId && ownerId !== null ? state : { ownerId, hotel: null, cart: [], notes: "", requestKey: "" }),
  selectHotel: (hotel) => set((state) => state.hotel?.id === hotel.id ? { hotel } : { hotel, cart: [], notes: "", requestKey: hotelRequestKey() }),
  addItem: (item) => set((state) => {
    if (!Number.isSafeInteger(item.serviceId) || item.serviceId <= 0 || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99999 || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0 || item.unitPrice > 999999.99) return state;
    if (!state.cart.some((line) => line.serviceId === item.serviceId) && state.cart.length >= 100) return state;
    return { requestKey: state.requestKey || hotelRequestKey(), cart: state.cart.some((line) => line.serviceId === item.serviceId) ? state.cart.map((line) => line.serviceId === item.serviceId ? { ...line, quantity: Math.min(99999, line.quantity + 1) } : line) : [...state.cart, item] };
  }),
  setLine: (id, values) => set((state) => {
    if (values.quantity !== undefined && (!Number.isSafeInteger(values.quantity) || values.quantity < 0 || values.quantity > 99999)) return state;
    if (values.unitPrice !== undefined && (!Number.isFinite(values.unitPrice) || values.unitPrice < 0.01 || values.unitPrice > 999999.99)) return state;
    return { cart: values.quantity === 0 ? state.cart.filter((line) => line.serviceId !== id) : state.cart.map((line) => line.serviceId === id ? { ...line, ...values, unitPrice: values.unitPrice === undefined ? line.unitPrice : Math.round((values.unitPrice + Number.EPSILON) * 100) / 100 } : line) };
  }),
  setNotes: (notes) => set({ notes }),
  resetDelivery: () => set({ cart: [], notes: "", requestKey: hotelRequestKey() }),
}), { name: "laundry-hotel-draft-v1", storage: createJSONStorage(() => sessionStorage), partialize: ({ ownerId, hotel, cart, notes, requestKey }) => ({ ownerId, hotel, cart, notes, requestKey }) }));
