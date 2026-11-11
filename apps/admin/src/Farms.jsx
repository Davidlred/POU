import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc, friendlyError } from './supabase';

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
];
const STATUS_LABEL = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' };
const QUICK_REASONS = ['ID photo is unclear', "Name on ID doesn't match", 'Outside our delivery area', 'Business details incomplete', 'Location not pinned'];

// 'kind' comes from admin_vendors() (migration 018); older backends don't send it.
const KIND_LABEL = { farm: 'Farm', store: 'Store', both: 'Farm + store' };
const SUPPLY_LABEL = { feed: 'Feed', equipment: 'Equipment', medicine: 'Drugs & vaccines' };
const noun = (f) => (f.kind === 'store' ? 'store' : f.kind ? 'farm' : '');

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

// Verification (template 3): list on the left, the selected business on the right.
export default function Farms({ onPending }) {
  const [farms, setFarms] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [tab, setTab] = useState('pending');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try { setFarms(await rpc('admin_vendors')); setLoadErr(null); } catch (e) { setLoadErr(friendlyError(e)); }
  }, []);

  useEffect(() => {
    load();
    // New applications and changes made elsewhere show up without a refresh.
    const ch = supabase.channel('ops-vendors').on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_profiles' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const counts = useMemo(() => {
    const n = { pending: 0, approved: 0, rejected: 0 };
    (farms || []).forEach((f) => { n[f.verification_status] = (n[f.verification_status] || 0) + 1; });
    return n;
  }, [farms]);
  useEffect(() => { onPending?.(counts.pending); }, [counts.pending, onPending]);

  const filtered = (list, which) => {
    const term = q.trim().toLowerCase();
    let out = (list || []).filter((f) => f.verification_status === which);
    if (term) out = out.filter((f) => [f.business_name, f.owner_name, f.email, f.location].some((x) => (x || '').toLowerCase().includes(term)));
    // Oldest pending first, so nobody waits longest.
    if (which === 'pending') out = [...out].reverse();
    return out;
  };
  const shown = useMemo(() => filtered(farms, tab), [farms, tab, q]);
  const selected = (farms || []).find((f) => f.user_id === selId) || null;

  // On a wide screen, open the first item so the page is never half empty.
  useEffect(() => {
    if (!selId && shown.length && window.innerWidth > 900) setSelId(shown[0].user_id);
  }, [shown, selId]);

  const decide = async (farm, status, reason) => {
    await rpc('admin_set_verification', { p_user: farm.user_id, p_status: status, p_reason: reason || null });
    const next = farms.map((f) => (f.user_id === farm.user_id ? { ...f, verification_status: status, rejection_reason: status === 'rejected' ? reason : null } : f));
    setFarms(next);
    setToast(farm.business_name + (status === 'approved' ? ' is approved.' : status === 'rejected' ? ' was rejected. They see your reason in the app.' : ' moved back to pending.'));
    // After a decision on a pending item, go straight to the next one waiting.
    if (farm.verification_status === 'pending' && status !== 'pending') {
      const waiting = filtered(next, 'pending');
      setSelId(waiting[0]?.user_id || null);
    }
    load();
  };

  return (
    <>
      <main className={'page split' + (selected ? ' has-detail' : '')}>
        <section className="list-pane">
          <div className="page-head">
            <h1>Verification</h1>
            <p className="muted">Farms and stores go live only after you approve them.</p>
          </div>
          <div className="toolbar">
            <div className="seg" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setSelId(null); }}>
                  {t.label} <span className="count">{counts[t.id]}</span>
                </button>
              ))}
            </div>
            <input className="input search" placeholder="Search name, owner, area" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search farms and stores" />
          </div>

          {loadErr ? <div className="banner err">{loadErr} <button className="link" onClick={load}>Try again</button></div> : null}
          {farms === null && !loadErr ? <div className="empty"><div className="spinner" /></div> : null}
          {farms && !shown.length ? (
            <div className="empty">
              <p className="strong">{q ? 'Nothing matches your search' : tab === 'pending' ? 'All caught up' : 'Nothing here yet'}</p>
              {tab === 'pending' && !q ? <p className="muted small">New applications appear here by themselves.</p> : null}
            </div>
          ) : null}

          {shown.length ? (
            <table className="table pick">
              <thead><tr><th>Business</th><th>Type</th><th className="right">Submitted</th></tr></thead>
              <tbody>
                {shown.map((f) => (
                  <tr key={f.user_id} className={f.user_id === selId ? 'on' : ''} onClick={() => setSelId(f.user_id)} tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') setSelId(f.user_id); }} aria-selected={f.user_id === selId}>
                    <td><div className="strong">{f.business_name}</div><div className="muted small">{f.owner_name || 'No name'} · {f.location || 'No location'}</div></td>
                    <td><span className="small">{KIND_LABEL[f.kind] || '—'}</span></td>
                    <td className="right muted small nowrap">{ago(f.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>

        {selected ? <Detail key={selected.user_id} farm={selected} onClose={() => setSelId(null)} onDecide={decide} /> : (
          <aside className="detail-pane placeholder hide-sm"><p className="muted">Pick a business to review it.</p></aside>
        )}
      </main>

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

// A signed URL for a private document (ID or licence), or the reason it can't be shown.
export function useSignedDoc(path) {
  const [doc, setDoc] = useState({ state: path ? 'loading' : 'none' });
  useEffect(() => {
    if (!path) { setDoc({ state: 'none' }); return; }
    let live = true;
    setDoc({ state: 'loading' });
    supabase.storage.from('id-docs').createSignedUrl(path, 600).then(({ data, error }) => {
      if (live) setDoc(error ? { state: 'error' } : { state: 'ok', url: data.signedUrl });
    });
    return () => { live = false; };
  }, [path]);
  return doc;
}

export function DocPanel({ doc, title, alt }) {
  return (
    <div className="panel">
      <p className="label">{title}</p>
      {doc.state === 'none' ? <div className="doc-box muted">Nothing uploaded</div>
        : doc.state === 'loading' ? <div className="doc-box"><div className="spinner" /></div>
        : doc.state === 'error' ? <div className="doc-box muted">Couldn't load it. Check that migration 002 (admin storage policy) has been run.</div>
        : <a href={doc.url} target="_blank" rel="noreferrer" className="doc-img"><img src={doc.url} alt={alt} /><span>Open full size ↗</span></a>}
    </div>
  );
}

function MapPanel({ farm }) {
  const pinned = farm.lat != null && farm.lng != null;
  const link = pinned ? 'https://www.google.com/maps?q=' + farm.lat + ',' + farm.lng : farm.location ? 'https://www.google.com/maps/search/' + encodeURIComponent(farm.location + ', Rivers State') : null;
  return (
    <div className="panel">
      <p className="label">{pinned ? 'Pinned location' : 'Location'}</p>
      {pinned ? (
        <div className="map-box">
          <iframe title={'Map of ' + farm.business_name} loading="lazy" src={'https://maps.google.com/maps?q=' + farm.lat + ',' + farm.lng + '&z=15&output=embed'} />
        </div>
      ) : <div className="doc-box muted">Not pinned yet{farm.location ? ' · ' + farm.location : ''}</div>}
      {link ? <a className="small" href={link} target="_blank" rel="noreferrer">Open in Google Maps ↗</a> : null}
    </div>
  );
}

function Detail({ farm, onClose, onDecide }) {
  const doc = useSignedDoc(farm.id_doc_path);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const act = async (status, why) => {
    setBusy(status); setErr(null);
    try { await onDecide(farm, status, why); setRejecting(false); setReason(''); setNote(''); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(null); }
  };
  const st = farm.verification_status;
  const why = [reason, note.trim()].filter(Boolean).join('. ');

  return (
    <aside className="detail-pane" aria-label={'Review ' + farm.business_name}>
      <div className="detail-head">
        <button className="btn ghost sm show-sm" onClick={onClose}>← Back</button>
        <div className="grow">
          <h2>{farm.business_name}</h2>
          <p className="muted small">{(KIND_LABEL[farm.kind] || 'Seller') + (farm.supplier_type && SUPPLY_LABEL[farm.supplier_type] ? ' · ' + SUPPLY_LABEL[farm.supplier_type] : '')} · applied {fmtDate(farm.created_at)}</p>
        </div>
        <Pill status={st} />
      </div>

      {st === 'rejected' && farm.rejection_reason ? <div className="banner err"><b>Rejected:</b> {farm.rejection_reason}</div> : null}
      {st === 'approved' ? <div className="banner ok"><b>Approved.</b> Their listings are live.</div> : null}

      <dl className="facts">
        <Fact k="Owner" v={farm.owner_name || '—'} />
        <Fact k="Email" v={farm.email ? <a href={'mailto:' + farm.email}>{farm.email}</a> : '—'} />
        {farm.phone ? <Fact k="Phone" v={<a href={'tel:+' + farm.phone}>+{farm.phone}</a>} /> : null}
        <Fact k="Address" v={farm.location || '—'} />
        <Fact k="Sells" v={(farm.categories || []).length ? <span className="chips">{farm.categories.map((c) => <span key={c} className="chip">{c}</span>)}</span> : '—'} />
        <Fact k="Listings" v={<span className="mono">{farm.listings}</span>} />
        {farm.rating_count ? <Fact k="Rating" v={<span className="mono">{Number(farm.rating).toFixed(1)} ★ ({farm.rating_count})</span>} /> : null}
      </dl>

      <div className="two">
        <DocPanel doc={doc} title="ID document" alt={'ID document for ' + farm.business_name} />
        <MapPanel farm={farm} />
      </div>

      {err ? <p className="error">{err}</p> : null}

      {rejecting ? (
        <div className="reject">
          <p className="strong">{st === 'approved' ? 'Why revoke the approval?' : 'Why reject?'}</p>
          <div className="chips">{QUICK_REASONS.map((r) => <button key={r} type="button" className={'chip btn-chip' + (reason === r ? ' on' : '')} aria-pressed={reason === r} onClick={() => setReason(reason === r ? '' : r)}>{r}</button>)}</div>
          <textarea className="input" rows={2} placeholder={'Anything else the ' + (noun(farm) || 'seller') + ' should fix (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="actions">
            <button className="btn ghost" onClick={() => { setRejecting(false); setReason(''); setNote(''); }}>Cancel</button>
            <button className="btn danger" disabled={!why || !!busy} onClick={() => act('rejected', why)}>{busy === 'rejected' ? 'Saving…' : why ? 'Confirm reject' : 'Pick a reason'}</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {st !== 'approved' ? <button className="btn primary" disabled={!!busy} onClick={() => act('approved')}>{busy === 'approved' ? 'Approving…' : ('Approve ' + noun(farm)).trim()}</button> : null}
          {st !== 'rejected' ? <button className="btn outline" disabled={!!busy} onClick={() => setRejecting(true)}>{st === 'approved' ? 'Revoke approval' : 'Reject'}</button> : null}
          {st !== 'pending' ? <button className="btn ghost" disabled={!!busy} onClick={() => act('pending')}>{busy === 'pending' ? 'Moving…' : 'Move back to pending'}</button> : null}
        </div>
      )}
    </aside>
  );
}

export const Pill = ({ status, label }) => <span className={'pill ' + status}>{label || STATUS_LABEL[status] || status}</span>;
const Fact = ({ k, v }) => <><dt>{k}</dt><dd>{v}</dd></>;
