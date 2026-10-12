import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc, friendlyError } from './supabase';
import { Decide, openDoc } from './Invest';

const TABS = [{ id: 'pending', label: 'Pending' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }];
const LABEL = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected' };
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Vets register in the app; farmers only see them once their licence is approved here.
export default function Vets() {
  const [rows, setRows] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [tab, setTab] = useState('pending');
  const [toast, setToast] = useState(null);
  const load = useCallback(async () => { try { setRows(await rpc('admin_vets')); setLoadErr(null); } catch (e) { setLoadErr(friendlyError(e)); } }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel('ops-vets').on('postgres_changes', { event: '*', schema: 'public', table: 'vets' }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  const counts = useMemo(() => { const n = { pending: 0, approved: 0, rejected: 0 }; (rows || []).forEach((v) => { n[v.status] += 1; }); return n; }, [rows]);
  const shown = (rows || []).filter((v) => v.status === tab);
  const run = async (v, status, reason, done) => {
    try { await rpc('admin_set_vet', { p_vet: v.id, p_status: status, p_reason: reason || null }); setToast(done); await load(); return null; } catch (e) { return friendlyError(e); }
  };
  const revoke = async (v) => {
    const r = window.prompt('Remove ' + v.name + ' from the vet list? Farmers will no longer be able to book them. Reason (shown to the vet):');
    if (!r || !r.trim()) return;
    const e = await run(v, 'rejected', r.trim(), v.name + ' is no longer bookable.');
    if (e) alert(e);
  };
  return (
    <>
      <main className="main single">
        <section className="list-pane">
          <div className="pane-head"><h1>Vets</h1><p className="muted">Check each vet's licence before farmers can book them.</p></div>
          <div className="toolbar"><div className="tabs" role="tablist">
            {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>{t.label}<span className={'count' + (t.id === 'pending' && counts.pending ? ' dot' : '')}>{counts[t.id]}</span></button>)}
          </div></div>
          {loadErr ? <div className="banner err">{loadErr} {/does not exist|schema cache/i.test(loadErr) ? 'Run supabase/migrations/007_personas_farm_book.sql first. ' : ''}<button className="link" onClick={load}>Try again</button></div> : null}
          {!rows && !loadErr ? <div className="empty"><div className="spinner" /></div> : null}
          {rows && !shown.length ? <div className="empty"><p className="strong">{tab === 'pending' ? 'No vets waiting for review' : 'Nothing here yet'}</p><p className="muted small">{tab === 'pending' ? 'New vet registrations appear here automatically.' : ''}</p></div> : null}
          <div className="cards">{shown.map((v) => (
            <article key={v.id} className="item">
              <div className="row between gap-sm wrap"><span className="strong">{v.name}</span><span className={'pill ' + v.status}>{LABEL[v.status]}</span></div>
              <dl className="facts">
                <dt>Specialty</dt><dd>{v.specialty || '—'}{v.years != null ? ' · ' + v.years + ' years in practice' : ''}</dd>
                <dt>Fee</dt><dd className="mono">{naira(v.fee)} per video consult{v.onsite ? ' · does farm visits' : ''}</dd>
                <dt>Contact</dt><dd>{v.email || 'No app account (added by Poultry360)'}{v.phone ? ' · +' + v.phone : ''}</dd>
                {v.bio ? <><dt>About</dt><dd>{v.bio}</dd></> : null}
                <dt>Licence</dt><dd>{v.licence_doc_path ? <button className="link" onClick={() => openDoc(v.licence_doc_path)}>View licence ↗</button> : 'None uploaded'}</dd>
                <dt>Registered</dt><dd>{day(v.created_at)}</dd>
              </dl>
              {v.status === 'rejected' && v.rejection_reason ? <div className="banner err">{v.rejection_reason}</div> : null}
              {v.status === 'pending' ? <Decide approveLabel="Approve vet" reasons={['Licence photo is unclear', "Name doesn't match the licence", 'Licence has expired', 'Could not confirm registration with the VCN']}
                onApprove={() => run(v, 'approved', null, v.name + ' can now be booked by farmers.')}
                onReject={(r) => run(v, 'rejected', r, v.name + ' was asked to resubmit.')} /> : null}
              {v.status === 'approved' ? <div className="actions"><button className="btn ghost sm danger-text" onClick={() => revoke(v)}>Remove from vet list</button></div> : null}
              {v.status === 'rejected' ? <div className="actions"><button className="btn outline sm" onClick={async () => { const e = await run(v, 'approved', null, v.name + ' can now be booked by farmers.'); if (e) alert(e); }}>Approve after all</button></div> : null}
            </article>))}</div>
        </section>
      </main>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}
