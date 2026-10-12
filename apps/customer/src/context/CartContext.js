import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@p360/shared';

const Ctx = createContext(null);
const KEY = 'p360-cart';

// Cart is cached locally so a dropped connection never loses it (PRD §15).
export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => v && setItems(JSON.parse(v))); }, []);
  const save = (next) => { setItems(next); AsyncStorage.setItem(KEY, JSON.stringify(next)); };

  const add = (listing, qty = 1, viaSearch = false) => {
    const i = items.findIndex((x) => x.listing_id === listing.id);
    if (i >= 0) { const n = [...items]; n[i] = { ...n[i], qty: n[i].qty + qty }; return save(n); }
    save([...items, { listing_id: listing.id, title: listing.title, price: Number(listing.price), unit: listing.unit, qty,
      vendor_id: listing.vendor_id, vendor_name: listing.vendor?.business_name, photo: listing.photos?.[0] || null, via_search: viaSearch }]);
  };
  const setQty = (id, qty) => save(qty <= 0 ? items.filter((x) => x.listing_id !== id) : items.map((x) => (x.listing_id === id ? { ...x, qty } : x)));
  const remove = (id) => save(items.filter((x) => x.listing_id !== id));
  const clear = () => save([]);

  // Re-checks stock before checkout and flags anything that sold out since it was added.
  const validate = async () => {
    if (!items.length) return items;
    const { data } = await supabase.from('listings').select('id,price,quantity,status').in('id', items.map((x) => x.listing_id));
    const map = Object.fromEntries((data || []).map((l) => [l.id, l]));
    const next = items.map((x) => { const l = map[x.listing_id]; return { ...x, price: l ? Number(l.price) : x.price, unavailable: !l || l.status !== 'live' || l.quantity < x.qty }; });
    save(next); return next;
  };

  const subtotal = items.filter((x) => !x.unavailable).reduce((s, x) => s + x.price * x.qty, 0);
  const count = items.reduce((s, x) => s + x.qty, 0);
  return <Ctx.Provider value={{ items, add, setQty, remove, clear, validate, subtotal, count }}>{children}</Ctx.Provider>;
}
export const useCart = () => useContext(Ctx);
