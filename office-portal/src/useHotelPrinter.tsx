"use client";
import { useEffect, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { api } from "../../app/client";
import type { HotelInvoice } from "../../contracts/src/hotels";
import HotelInvoiceReceipt from "./HotelInvoiceReceipt";

export function useHotelPrinter(onError: (message: string) => void) {
  const [invoice,setInvoice] = useState<HotelInvoice|null>(null);
  useEffect(()=>{
    const clear = ()=>setInvoice(null);
    window.addEventListener("afterprint",clear);
    return ()=>window.removeEventListener("afterprint",clear);
  },[]);
  async function printHotelInvoice(selected: HotelInvoice) {
    try {
      const result = await api<{invoice:HotelInvoice}>("/api/hotel-invoices?id="+selected.id+"&purpose=print");
      flushSync(()=>setInvoice(result.invoice));
      await document.fonts.ready;
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      window.print();
    } catch(error) { setInvoice(null); onError(error instanceof Error ? error.message : "Unable to print hotel invoice."); }
  }
  return { printHotelInvoice, hotelPrintNode: invoice && typeof document !== "undefined"
    ? createPortal(<div id="hotel-print-host"><HotelInvoiceReceipt invoice={invoice}/></div>,document.body) : null };
}
