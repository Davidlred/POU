import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc, friendlyError } from './supabase';
import { Decide } from './Invest';
import { ago, useSignedDoc, DocPanel, Pill } from './Farms';

const TABS = [{ id: 'pending', label: 'Pending' }, { id: 'approved', label: 'Approved' }, { id: 'rejected', label: 'Rejected' }];
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const REASONS = ['Licence photo is unclear', "Name doesn't match the licence", 'Licence has expired', 'Could not confirm with the VCN'];

// Vets register in the app; farmers only see them once their licence is approved here. Same layout as Verification.
export default function Vets() {
  const [rows, setRows] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [tab, setTab] = useState('pending');
  const [selId, setSelId] = useState(null);
  const [toast, setToast] = useState(null);
  const load = useCallback(async () => { try { setRows(await rpc('admin_vets')); setLoadErr(null); } catch (e) { setLoadErr(friendlyError(e)); } }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel('ops-vets').on('postgres_changes', { event: '*', schema: 'public', table: 'vets' }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  const counts = useMemo(() => { const n = { pending: 0, approved: 0, rejected: 0 }; (rows || []).forEach((v) => { n[v.status] = (n[v.status] || 0) + 1; }); return n; }, [rows]);
  const shown = (rows || []).filter((v) => v.status === tab);
  const selected = (rows || []).find((v) => v.id === selId) || null;
  useEffect(() => { if (!selId && shown.length && window.innerWidth > 900) setSelId(shown[0].id); }, [shown, selId]);
  const run = async (v, status, reason, done) => {
    try {
      await rpc('admin_set_vet', { p_vet: v.id, p_status: status, p_reason: reason || null });
      setToast(done);
      if (v.status === 'pending') setSelId(shown.find((x) => x.id !== v.id)?.id || null);   // on to the next one waiting
      await load(); return null;
    } catch (e) { return friendlyError(e); }
  };
  return (
    <>
      <main className={'page split' + (selected ? ' has-detail' : '')}>
        <section className="list-pane">
          <div className="page-head"><h1>Vets</h1><p className="muted">Farmers can book a vet only after you approve their licence.</p></div>
          <div className="toolbar"><div className="seg" role="tablist">
            {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setSelId(null); }}>{t.label} <span className="count">{counts[t.id]}</span></button>)}
          </div></div>
          {loadErr ? <div className="banner err">{loadErr} {/does not exist|schema cache/i.test(loadErr) ? 'Run supabase/migrations/007_personas_farm_book.sql first. ' : ''}<button className="link" onClick={load}>Try again</button></div> : null}
          {!rows && !loadErr ? <div className="empty"><div className="spinner" /></div> : null}
          {rows && !shown.length ? <div className="empty"><p className="strong">{tab === 'pending' ? 'All caught up' : 'Nothing here yet'}</p></div> : null}
          {shown.length ? (
            <table className="table pick">
              <thead><tr><th>Vet</th><th>Specialty</th><th className="right">Registered</th></tr></thead>
              <tbody>{shown.map((v) => (
                <tr key={v.id} className={v.id === selId ? 'on' : ''} onClick={() => setSelId(v.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSelId(v.id); }}>
                  <td><div className="strong">{v.name}</div><div className="muted small">{naira(v.fee)} a consult</div></td>
                  <td className="small">{v.specialty || '—'}</td>
                  <td className="right muted small nowrap">{ago(v.created_at)}</td>
                </tr>))}</tbody>
            </table>
          ) : null}
        </section>
        {selected ? <VetDetail key={selected.id} v={selected} onClose={() => setSelId(null)} run={run} /> : <aside className="detail-pane placeholder hide-sm"><p className="muted">Pick a vet to review.</p></aside>}
      </main>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

function VetDetail({ v, onClose, run }) {
  const doc = useSignedDoc(v.licence_doc_path);
  const [err, setErr] = useState(null);
  const act = async (status, reason, done) => { const e = await run(v, status, reason, done); setErr(e); return e; };
  const revoke = async () => {
    const r = window.prompt('Remove ' + v.name + ' from the vet list? Farmers can no longer book them. Reason (shown to the vet):');
    if (r && r.trim()) act('rejected', r.trim(), v.name + ' is no longer bookable.');
  };
  return (
    <aside className="detail-pane" aria-label={'Review ' + v.name}>
      <div className="detail-head">
        <button className="btn ghost sm show-sm" onClick={onClose}>← Back</button>
        <div className="grow"><h2>{v.name}</h2><p className="muted small">{(v.specialty || 'Poultry vet') + (v.years != null ? ' · ' + v.years + ' years' : '')} · registered {day(v.created_at)}</p></div>
        <Pill status={v.status} />
      </div>
      {v.status === 'rejected' && v.rejection_reason ? <div className="banner err"><b>Rejected:</b> {v.rejection_reason}</div> : null}
      <div className="two">
        <dl className="facts">
          <dt>Fee</dt><dd className="mono">{naira(v.fee)} a video consult</dd>
          <dt>Farm visits</dt><dd>{v.onsite ? 'Yes' : 'No'}</dd>
          <dt>Email</dt><dd>{v.email || 'No app account'}</dd>
          {v.phone ? <><dt>Phone</dt><dd>+{v.phone}</dd></> : null}
          {v.bio ? <><dt>About</dt><dd>{v.bio}</dd></> : null}
        </dl>
        <DocPanel doc={doc} title="Licence" alt={'Licence for ' + v.name} />
      </div>
      {err ? <p className="error">{err}</p> : null}
      {v.status === 'pending' ? <Decide approveLabel="Approve vet" reasons={REASONS}
        onApprove={() => act('approved', null, v.name + ' can now be booked.')}
        onReject={(r) => act('rejected', r, v.name + ' was asked to resubmit.')} /> : null}
      {v.status !== 'pending' ? (
        <div className="actions">
          {v.status === 'approved' ? <button className="btn ghost danger-text" onClick={revoke}>Remove from vet list</button>
            : <button className="btn outline" onClick={() => act('approved', null, v.name + ' can now be booked.')}>Approve after all</button>}
        </div>
      ) : null}
    </aside>
  );
}
