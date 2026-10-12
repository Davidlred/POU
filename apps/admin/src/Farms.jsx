import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc, friendlyError } from './supabase';

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];
const STATUS_LABEL = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' };
const QUICK_REASONS = ["ID photo is unclear or cut off", "Name on ID doesn't match the account", 'Farm location is outside our delivery area', 'Business details are incomplete'];

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

export default function Farms() {
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
    const n = { pending: 0, approved: 0, rejected: 0, all: 0 };
    (farms || []).forEach((f) => { n[f.verification_status] += 1; n.all += 1; });
    return n;
  }, [farms]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = (farms || []).filter((f) => tab === 'all' || f.verification_status === tab);
    if (term) list = list.filter((f) => [f.business_name, f.owner_name, f.email, f.location].some((x) => (x || '').toLowerCase().includes(term)));
    // Oldest pending first, so nobody waits longest.
    if (tab === 'pending') list = [...list].reverse();
    return list;
  }, [farms, tab, q]);

  const selected = (farms || []).find((f) => f.user_id === selId) || null;

  const decide = async (farm, status, reason) => {
    await rpc('admin_set_verification', { p_user: farm.user_id, p_status: status, p_reason: reason || null });
    setFarms((list) => list.map((f) => (f.user_id === farm.user_id ? { ...f, verification_status: status, rejection_reason: status === 'rejected' ? reason : null } : f)));
    setToast(farm.business_name + (status === 'approved' ? ' is approved and can now list products.' : status === 'rejected' ? ' was rejected. They’ll see your reason in the app.' : ' moved back to pending.'));
    load();
  };

  return (
    <>
      <main className={'main' + (selected ? ' has-detail' : '')}>
        <section className="list-pane">
          <div className="pane-head">
            <h1>Farm verification</h1>
            <p className="muted">Approve farms before their listings go live to buyers.</p>
          </div>
          <div className="stats">
            <Stat label="Waiting for review" value={counts.pending} tone={counts.pending ? 'warn' : ''} />
            <Stat label="Approved farms" value={counts.approved} />
            <Stat label="Rejected" value={counts.rejected} />
          </div>
          <div className="toolbar">
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
                  {t.label}<span className="count">{counts[t.id]}</span>
                </button>
              ))}
            </div>
            <input className="input search" placeholder="Search farm, owner, email, area" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search farms" />
          </div>

          {loadErr ? <div className="banner err">{loadErr} <button className="link" onClick={load}>Try again</button></div> : null}
          {farms === null && !loadErr ? <div className="empty"><div className="spinner" /></div> : null}
          {farms && !shown.length ? (
            <div className="empty">
              <p className="strong">{q ? 'No farms match your search' : tab === 'pending' ? 'All caught up' : 'Nothing here yet'}</p>
              <p className="muted small">{q ? 'Try a different name or area.' : tab === 'pending' ? 'New farm applications will appear here automatically.' : ''}</p>
            </div>
          ) : null}

          <ul className="farm-list">
            {shown.map((f) => (
              <li key={f.user_id}>
                <button className={'farm-row' + (f.user_id === selId ? ' on' : '')} onClick={() => setSelId(f.user_id)}>
                  <div className="avatar">{(f.business_name || '?').slice(0, 1).toUpperCase()}</div>
                  <div className="grow">
                    <div className="row gap-sm"><span className="strong">{f.business_name}</span>{tab === 'all' ? <Pill status={f.verification_status} /> : null}</div>
                    <div className="muted small">{f.owner_name || 'No name'} · {f.location || 'No location'}</div>
                  </div>
                  <span className="muted small mono nowrap">{ago(f.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {selected ? <Detail key={selected.user_id} farm={selected} onClose={() => setSelId(null)} onDecide={decide} /> : (
          <aside className="detail-pane placeholder hide-sm"><p className="muted">Select a farm to review its details and ID.</p></aside>
        )}
      </main>

      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

function Detail({ farm, onClose, onDecide }) {
  const [doc, setDoc] = useState({ state: farm.id_doc_path ? 'loading' : 'none' });
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!farm.id_doc_path) return;
    let live = true;
    supabase.storage.from('id-docs').createSignedUrl(farm.id_doc_path, 600).then(({ data, error }) => {
      if (live) setDoc(error ? { state: 'error' } : { state: 'ok', url: data.signedUrl });
    });
    return () => { live = false; };
  }, [farm.id_doc_path]);

  const act = async (status, why) => {
    setBusy(status); setErr(null);
    try { await onDecide(farm, status, why); setRejecting(false); setReason(''); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(null); }
  };
  const st = farm.verification_status;
  const map = farm.lat != null && farm.lng != null ? 'https://www.google.com/maps?q=' + farm.lat + ',' + farm.lng : farm.location ? 'https://www.google.com/maps/search/' + encodeURIComponent(farm.location + ', Rivers State') : null;

  return (
    <aside className="detail-pane" aria-label={'Review ' + farm.business_name}>
      <div className="detail-head">
        <button className="btn ghost sm show-sm" onClick={onClose}>← Back</button>
        <div className="grow">
          <Pill status={st} />
          <h2>{farm.business_name}</h2>
          <p className="muted small">Applied {fmtDate(farm.created_at)}</p>
        </div>
        <button className="icon-btn hide-sm" onClick={onClose} aria-label="Close">×</button>
      </div>

      {st === 'rejected' && farm.rejection_reason ? <div className="banner err"><b>Rejection reason:</b> {farm.rejection_reason}</div> : null}

      <dl className="facts">
        <Fact k="Owner" v={farm.owner_name || '—'} />
        <Fact k="Email" v={farm.email ? <a href={'mailto:' + farm.email}>{farm.email}</a> : '—'} />
        {farm.phone ? <Fact k="Phone" v={<a href={'tel:+' + farm.phone}>+{farm.phone}</a>} /> : null}
        <Fact k="Location" v={<>{farm.location || '—'}{map ? <> · <a href={map} target="_blank" rel="noreferrer">Open map</a></> : null}</>} />
        <Fact k="Sells" v={(farm.categories || []).length ? <span className="chips">{farm.categories.map((c) => <span key={c} className="chip">{c}</span>)}</span> : '—'} />
        <Fact k="Listings" v={<span className="mono">{farm.listings}</span>} />
        {farm.rating_count ? <Fact k="Rating" v={<span className="mono">{Number(farm.rating).toFixed(1)} ★ ({farm.rating_count})</span>} /> : null}
      </dl>

      <div className="doc">
        <p className="label">ID document</p>
        {doc.state === 'none' ? <div className="doc-box muted">No ID uploaded</div>
          : doc.state === 'loading' ? <div className="doc-box"><div className="spinner" /></div>
          : doc.state === 'error' ? <div className="doc-box muted">Couldn't load the ID. Check that migration 002 (admin storage policy) has been run.</div>
          : <a href={doc.url} target="_blank" rel="noreferrer" className="doc-img"><img src={doc.url} alt={'ID document for ' + farm.business_name} /><span>Open full size ↗</span></a>}
      </div>

      {err ? <p className="error">{err}</p> : null}

      {rejecting ? (
        <div className="reject">
          <p className="label">Reason for the farm</p>
          <div className="chips">{QUICK_REASONS.map((r) => <button key={r} type="button" className={'chip btn-chip' + (reason === r ? ' on' : '')} onClick={() => setReason(r)}>{r}</button>)}</div>
          <textarea className="input" rows={3} autoFocus placeholder="Tell the farm what to fix. They'll see this in the app." value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="actions">
            <button className="btn ghost" onClick={() => { setRejecting(false); setReason(''); }}>Cancel</button>
            <button className="btn danger" disabled={!reason.trim() || !!busy} onClick={() => act('rejected', reason.trim())}>{busy === 'rejected' ? 'Rejecting…' : st === 'approved' ? 'Revoke approval' : 'Reject farm'}</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {st !== 'approved' ? <button className="btn primary" disabled={!!busy} onClick={() => act('approved')}>{busy === 'approved' ? 'Approving…' : 'Approve farm'}</button> : null}
          {st !== 'rejected' ? <button className="btn outline" disabled={!!busy} onClick={() => setRejecting(true)}>{st === 'approved' ? 'Revoke approval' : 'Reject'}</button> : null}
          {st === 'rejected' ? <button className="btn ghost" disabled={!!busy} onClick={() => act('pending')}>{busy === 'pending' ? 'Moving…' : 'Move back to pending'}</button> : null}
        </div>
      )}
    </aside>
  );
}

const Stat = ({ label, value, tone }) => <div className={'stat ' + (tone || '')}><span className="mono stat-n">{value}</span><span className="muted small">{label}</span></div>;
const Pill = ({ status }) => <span className={'pill ' + status}>{STATUS_LABEL[status] || status}</span>;
const Fact = ({ k, v }) => <><dt>{k}</dt><dd>{v}</dd></>;
