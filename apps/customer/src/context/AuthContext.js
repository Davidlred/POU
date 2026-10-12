import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase, rpc, liveChannel } from '@p360/shared';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [wallet, setWallet] = useState(null);
  const lastRole = useRef(null);   // the role in use before the most recent switch

  const refresh = useCallback(async (uid) => {
    const id = uid || (await supabase.auth.getUser()).data.user?.id;
    if (!id) return;
    const [p, v, w] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('vendor_profiles').select('*').eq('user_id', id).maybeSingle(),
      supabase.from('wallets').select('balance').eq('user_id', id).maybeSingle(),
    ]);
    setProfile(p.data); setVendor(v.data); setWallet(w.data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (data.session) refresh(data.session.user.id); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (s) refresh(s.user.id); else { setProfile(null); setVendor(null); } });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  // Push verification decisions straight into the UI (approved banner / rejected reason).
  useEffect(() => {
    const uid = session?.user?.id; if (!uid) return;
    const ch = liveChannel('vendor-' + uid)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'vendor_profiles', filter: 'user_id=eq.' + uid }, (p) => setVendor(p.new))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session?.user?.id]);

  const value = {
    session, profile, vendor, wallet, uid: session?.user?.id,
    loading: session === undefined || (session && !profile),
    refresh,
    refreshWallet: async () => { const { data } = await supabase.from('wallets').select('balance').eq('user_id', session.user.id).maybeSingle(); setWallet(data); },
    setActiveRole: async (r) => { if (profile?.active_role && profile.active_role !== r) lastRole.current = profile.active_role; await rpc('set_active_role', { p_role: r }); await refresh(); },
    // Where to send someone who leaves vet mode: the role they came from, else buying, else their farm.
    homeRole: () => { const others = (profile?.roles || []).filter((x) => x !== 'vet' && x !== 'investor'); return others.includes(lastRole.current) ? lastRole.current : others.includes('buyer') ? 'buyer' : others[0] || null; },
    signOut: () => supabase.auth.signOut(),
    isVendorMode: profile?.active_role === 'vendor' || profile?.active_role === 'supplier',
    multiRole: (profile?.roles || []).length > 1,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
