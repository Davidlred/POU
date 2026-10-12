import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc, friendlyError } from './supabase';

const TABS = [{ id: 'active', label: 'Active' }, { id: 'inactive', label: 'Deactivated' }, { id: 'all', label: 'All' }];
const VEHICLES = ['Bike', 'Tricycle', 'Car', 'Van'];
const EMPTY = { id: null, name: '', email: '', phone: '', vehicle: 'Bike', plate: '', zone: '' };

function statusOf(r) {
  if (!r.active) return { key: 'rejected', label: 'Deactivated' };
  if (r.on_job || r.status === 'on_delivery') return { key: 'pending', label: 'On delivery' };
  if (r.status === 'available') return { key: 'approved', label: 'Available' };
  return { key: 'offline', label: 'Offline' };
}
const fmtPhone = (p) => (p ? '+' + p : '—');
function ago(iso) {
  if (!iso) return null;
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}
const signInText = (r) => `Hi ${r.name.split(' ')[0]}, you've been added as a Poultry360 rider.\n\n1. Install the Poultry360 Rider app.\n2. Sign in with this email: ${r.email}\n3. Enter the 6-digit code we email you.\n\nThen tap "Go available" to start receiving deliveries.`;

export default function Riders() {
  const [riders, setRiders] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [tab, setTab] = useState('active');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [form, setForm] = useState(null); // null = viewing, object = adding/editing
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try { setRiders(await rpc('admin_riders')); setLoadErr(null); } catch (e) { setLoadErr(friendlyError(e)); }
  }, []);

  useEffect(() => {
    load();
    // Status changes (available / on delivery / signed in) show up live.
    const ch = supabase.channel('ops-riders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const counts = useMemo(() => {
    const n = { active: 0, inactive: 0, all: 0, available: 0, onJob: 0 };
    (riders || []).forEach((r) => {
      n.all += 1; n[r.active ? 'active' : 'inactive'] += 1;
      const s = statusOf(r).label;
      if (s === 'Available') n.available += 1; if (s === 'On delivery') n.onJob += 1;
    });
    return n;
  }, [riders]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = (riders || []).filter((r) => tab === 'all' || (tab === 'active' ? r.active : !r.active));
    if (term) list = list.filter((r) => [r.name, r.email, r.phone, r.plate, r.zone].some((x) => (x || '').toLowerCase().includes(term)));
    return list;
  }, [riders, tab, q]);

  const zones = useMemo(() => [...new Set(['GRA & D-Line', 'Trans-Amadi & Woji', 'Rumuokoro & Eliozu', 'Ada George & Rumuola', 'Choba & Alakahia', 'Diobu & Town', 'Elelenwo & Rumuomasi', ...(riders || []).map((r) => r.zone).filter(Boolean)])], [riders]);
  const selected = (riders || []).find((r) => r.id === selId) || null;
  const panelOpen = !!form || !!selected;

  const saved = (r, isNew) => {
    setForm(null); setSelId(r.id); setTab(r.active ? 'active' : tab);
    setToast(isNew ? r.name + ' added. Send them their sign-in details.' : r.name + ' updated.');
    load();
  };

  return (
    <>
      <main className={'main' + (panelOpen ? ' has-detail' : '')}>
        <section className="list-pane">
          <div className="pane-head row between wrap gap">
            <div>
              <h1>Riders</h1>
              <p className="muted">Riders sign in to the rider app with the email you add here.</p>
            </div>
            <button className="btn primary" onClick={() => { setSelId(null); setForm({ ...EMPTY }); }}>+ Add rider</button>
          </div>
          <div className="stats">
            <Stat label="Active riders" value={counts.active} />
            <Stat label="Available now" value={counts.available} tone={counts.available ? 'ok' : ''} />
            <Stat label="On delivery" value={counts.onJob} />
          </div>
          <div className="toolbar">
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
                  {t.label}<span className="count">{counts[t.id]}</span>
                </button>
              ))}
            </div>
            <input className="input search" placeholder="Search name, email, phone, plate, zone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search riders" />
          </div>

          {loadErr ? <div className="banner err">{loadErr} <button className="link" onClick={load}>Try again</button></div> : null}
          {riders === null && !loadErr ? <div className="empty"><div className="spinner" /></div> : null}
          {riders && !shown.length ? (
            <div className="empty">
              <p className="strong">{q ? 'No riders match your search' : riders.length ? 'Nothing here' : 'No riders yet'}</p>
              <p className="muted small">{q ? 'Try a different name or plate.' : riders.length ? '' : 'Add your first rider to start dispatching deliveries.'}</p>
            </div>
          ) : null}

          <ul className="farm-list">
            {shown.map((r) => {
              const st = statusOf(r);
              return (
                <li key={r.id}>
                  <button className={'farm-row' + (r.id === selId && !form ? ' on' : '')} onClick={() => { setForm(null); setSelId(r.id); }}>
                    <div className="avatar rider">{r.name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</div>
                    <div className="grow">
                      <div className="row gap-sm wrap"><span className="strong">{r.name}</span><span className={'pill ' + st.key}>{st.label}</span></div>
                      <div className="muted small">{r.vehicle}{r.plate ? ' · ' + r.plate : ''}{r.zone ? ' · ' + r.zone : ''}</div>
                    </div>
                    {!r.signed_in ? <span className="muted small nowrap">Not signed in</span> : <span className="muted small mono nowrap">{r.delivered} done</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {form ? <RiderForm key={form.id || 'new'} initial={form} zones={zones} onCancel={() => setForm(null)} onSaved={saved} />
          : selected ? <RiderDetail key={selected.id} rider={selected} onClose={() => setSelId(null)} onEdit={() => setForm({ ...EMPTY, ...selected, phone: selected.phone || '', plate: selected.plate || '', zone: selected.zone || '' })}
              onToast={setToast} onChanged={load} />
          : <aside className="detail-pane placeholder hide-sm"><p className="muted">Select a rider, or add a new one.</p></aside>}
      </main>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

function RiderForm({ initial, zones, onCancel, onSaved }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const isNew = !initial.id;
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErr(null); };
  const emailChanged = !isNew && f.email.trim().toLowerCase() !== (initial.email || '').toLowerCase();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await rpc('admin_save_rider', { p_id: f.id, p_email: f.email, p_name: f.name, p_phone: f.phone || null, p_vehicle: f.vehicle, p_plate: f.plate || null, p_zone: f.zone || null });
      onSaved(r, isNew);
    } catch (e2) { setErr(friendlyError(e2)); } finally { setBusy(false); }
  };

  return (
    <aside className="detail-pane" aria-label={isNew ? 'Add rider' : 'Edit rider'}>
      <div className="detail-head">
        <button type="button" className="btn ghost sm show-sm" onClick={onCancel}>← Back</button>
        <div className="grow"><h2>{isNew ? 'Add a rider' : 'Edit ' + initial.name}</h2>
          <p className="muted small">{isNew ? 'They sign in to the rider app with this email and a code we send them.' : 'Changes apply straight away.'}</p></div>
        <button type="button" className="icon-btn hide-sm" onClick={onCancel} aria-label="Close">×</button>
      </div>
      <form className="form" onSubmit={submit}>
        <Field label="Full name"><input className="input" required autoFocus value={f.name} onChange={set('name')} placeholder="Tunde Adebayo" autoComplete="off" /></Field>
        <Field label="Sign-in email" hint={emailChanged && initial.signed_in ? 'Changing this signs the rider out. They must sign in again with the new email.' : 'Use an email the rider can open on their phone.'}>
          <input className="input" type="email" required value={f.email} onChange={set('email')} placeholder="tunde@example.com" autoComplete="off" />
        </Field>
        <Field label="Phone (optional)" hint="Shown to buyers and farms so they can call the rider.">
          <input className="input" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="0803 123 4567" autoComplete="off" />
        </Field>
        <div className="grid2">
          <Field label="Vehicle"><select className="input" value={f.vehicle} onChange={set('vehicle')}>{VEHICLES.map((v) => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Plate number"><input className="input" value={f.plate} onChange={set('plate')} placeholder="PHC 482 KJ" autoComplete="off" /></Field>
        </div>
        <Field label="Zone"><input className="input" list="zones" value={f.zone} onChange={set('zone')} placeholder="GRA & D-Line" autoComplete="off" />
          <datalist id="zones">{zones.map((z) => <option key={z} value={z} />)}</datalist></Field>
        {err ? <p className="error">{err}</p> : null}
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={busy || !f.name.trim() || !f.email.trim()}>{busy ? 'Saving…' : isNew ? 'Add rider' : 'Save changes'}</button>
        </div>
      </form>
    </aside>
  );
}

function RiderDetail({ rider: r, onClose, onEdit, onToast, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const st = statusOf(r);

  const toggleActive = async () => {
    if (r.active && !window.confirm('Deactivate ' + r.name + '? They will stop receiving new deliveries.')) return;
    setBusy(true); setErr(null);
    try { await rpc('admin_set_rider_active', { p_id: r.id, p_active: !r.active }); onToast(r.name + (r.active ? ' deactivated.' : ' reactivated.')); onChanged(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(signInText(r)); onToast('Sign-in instructions copied. Paste them into WhatsApp or SMS.'); }
    catch { onToast("Couldn't copy. Select the text and copy it manually."); }
  };

  return (
    <aside className="detail-pane" aria-label={r.name}>
      <div className="detail-head">
        <button className="btn ghost sm show-sm" onClick={onClose}>← Back</button>
        <div className="grow">
          <span className={'pill ' + st.key}>{st.label}</span>
          <h2>{r.name}</h2>
          <p className="muted small">{r.signed_in ? 'Signed in to the rider app' : 'Hasn’t signed in yet'}{r.location_updated_at ? ' · location ' + ago(r.location_updated_at) : ''}</p>
        </div>
        <button className="icon-btn hide-sm" onClick={onClose} aria-label="Close">×</button>
      </div>

      <dl className="facts">
        <dt>Sign-in email</dt><dd><a href={'mailto:' + r.email}>{r.email}</a></dd>
        <dt>Phone</dt><dd>{r.phone ? <a href={'tel:+' + r.phone}>{fmtPhone(r.phone)}</a> : '—'}</dd>
        <dt>Vehicle</dt><dd>{r.vehicle}{r.plate ? <> · <span className="mono">{r.plate}</span></> : null}</dd>
        <dt>Zone</dt><dd>{r.zone || '—'}</dd>
        <dt>Deliveries</dt><dd className="mono">{r.delivered}</dd>
      </dl>

      <div className="signin-box">
        <p className="label">How {r.name.split(' ')[0]} signs in</p>
        <ol className="steps">
          <li>Open the <b>Poultry360 Rider</b> app</li>
          <li>Enter <b>{r.email}</b></li>
          <li>Type the 6-digit code from their email</li>
        </ol>
        <button className="btn outline sm" onClick={copy}>Copy instructions to send</button>
      </div>

      {err ? <p className="error">{err}</p> : null}
      <div className="actions">
        <button className="btn outline" onClick={onEdit}>Edit details</button>
        <button className={'btn ' + (r.active ? 'ghost danger-text' : 'primary')} disabled={busy} onClick={toggleActive}>{busy ? 'Saving…' : r.active ? 'Deactivate' : 'Reactivate'}</button>
      </div>
      {r.active && r.on_job ? <p className="muted small">Deactivating lets them finish their current delivery, then they get no new ones.</p> : null}
    </aside>
  );
}

const Stat = ({ label, value, tone }) => <div className={'stat ' + (tone || '')}><span className="mono stat-n">{value}</span><span className="muted small">{label}</span></div>;
const Field = ({ label, hint, children }) => <label className="field"><span className="field-label">{label}</span>{children}{hint ? <span className="muted small">{hint}</span> : null}</label>;
