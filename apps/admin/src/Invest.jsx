import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, rpc, friendlyError } from './supabase';

const TABS = [{ id: 'kyc', label: 'Identity (KYC)' }, { id: 'badges', label: 'Farm badges' }, { id: 'offerings', label: 'Offerings' }, { id: 'pools', label: 'Pools' }];
const LABEL = { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', pending_review: 'In review', open: 'Open', funded: 'Fully funded',
  active: 'Active', matured: 'Matured', refunded: 'Refunded', suspended: 'Paused' };
const PILL = { pending: 'pending', pending_review: 'pending', funded: 'pending', approved: 'approved', open: 'approved', active: 'approved', rejected: 'rejected', suspended: 'rejected', matured: 'offline', refunded: 'offline' };
const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export async function openDoc(path) {
  const { data, error } = await supabase.storage.from('id-docs').createSignedUrl(path, 600);
  if (error) return alert("Couldn't open the document. " + friendlyError(error));
  window.open(data.signedUrl, '_blank', 'noopener');
}

export default function Invest() {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [tab, setTab] = useState('kyc');
  const [toast, setToast] = useState(null);
  const load = useCallback(async () => {
    try { setData(await rpc('admin_invest_overview')); setLoadErr(null); } catch (e) { setLoadErr(friendlyError(e)); }
  }, []);
  useEffect(() => {
    load();
    const ch = supabase.channel('ops-invest')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investment_offerings' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investment_pools' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_profiles' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  // Runs an admin action, then refreshes. Returns an error message for the card to show, or null.
  const run = async (fn, args, done) => {
    try { await rpc(fn, args); setToast(done); await load(); return null; } catch (e) { return friendlyError(e); }
  };
  const todo = useMemo(() => !data ? {} : {
    kyc: data.kyc.filter((k) => k.status === 'pending').length,
    badges: data.badges.filter((b) => b.investment_badge === 'pending').length,
    offerings: data.offerings.filter((o) => ['pending_review', 'funded'].includes(o.status)).length,
    pools: data.pools.filter((p) => p.status === 'funded').length,
  }, [data]);

  return (
    <>
      <main className="main single">
        <section className="list-pane">
          <div className="pane-head">
            <h1>Investments</h1>
            <p className="muted">Review investors and farms, start funded terms and pay out returns.</p>
          </div>
          <div className="toolbar">
            <div className="tabs" role="tablist">
              {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>{t.label}{todo[t.id] ? <span className="count dot">{todo[t.id]}</span> : null}</button>)}
            </div>
          </div>
          {loadErr ? <div className="banner err">{loadErr} {/does not exist|schema cache/i.test(loadErr) ? 'Run supabase/migrations/006_investment.sql first. ' : ''}<button className="link" onClick={load}>Try again</button></div> : null}
          {!data && !loadErr ? <div className="empty"><div className="spinner" /></div> : null}
          {data && tab === 'kyc' ? <Kyc rows={data.kyc} run={run} /> : null}
          {data && tab === 'badges' ? <Badges rows={data.badges} run={run} /> : null}
          {data && tab === 'offerings' ? <Targets kind="offering" rows={data.offerings} run={run} /> : null}
          {data && tab === 'pools' ? <Pools rows={data.pools} farms={data.badges.filter((b) => b.investment_badge === 'approved' && b.verification_status === 'approved')} run={run} /> : null}
        </section>
      </main>
      {toast ? <div className="toast" role="status">{toast}</div> : null}
    </>
  );
}

// Approve / reject-with-reason buttons shared by KYC, badges and offering review.
export function Decide({ onApprove, onReject, approveLabel = 'Approve', reasons }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (fn) => { setBusy(true); setErr(null); const e = await fn(); setBusy(false); if (e) setErr(e); else { setRejecting(false); setReason(''); } };
  return (
    <div className="reject">
      {err ? <p className="error">{err}</p> : null}
      {rejecting ? <>
        <div className="chips">{reasons.map((r) => <button key={r} type="button" className={'chip btn-chip' + (reason === r ? ' on' : '')} onClick={() => setReason(r)}>{r}</button>)}</div>
        <textarea className="input" rows={2} autoFocus placeholder="Tell them what to fix. They see this in the app." value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="actions"><button className="btn ghost sm" onClick={() => setRejecting(false)}>Cancel</button><button className="btn danger sm" disabled={!reason.trim() || busy} onClick={() => go(() => onReject(reason.trim()))}>Reject</button></div>
      </> : <div className="actions"><button className="btn primary sm" disabled={busy} onClick={() => go(onApprove)}>{busy ? 'Saving…' : approveLabel}</button><button className="btn outline sm" disabled={busy} onClick={() => setRejecting(true)}>Reject</button></div>}
    </div>
  );
}

const Empty = ({ title, body }) => <div className="empty"><p className="strong">{title}</p><p className="muted small">{body}</p></div>;
const Fact = ({ k, v }) => <><dt>{k}</dt><dd>{v}</dd></>;

function Kyc({ rows, run }) {
  if (!rows.length) return <Empty title="No identity checks yet" body="Investors appear here when they submit their details." />;
  return <div className="cards">{rows.map((k) => (
    <article key={k.user_id} className="item">
      <div className="row between gap-sm wrap"><span className="strong">{k.full_name}</span><span className={'pill ' + PILL[k.status]}>{LABEL[k.status]}</span></div>
      <dl className="facts">
        <Fact k="Email" v={k.email || '—'} /><Fact k="Born" v={day(k.date_of_birth)} /><Fact k="Address" v={k.address} />
        <Fact k="BVN" v={k.bvn_last4 ? '•••••• ' + k.bvn_last4 : 'Not given'} /><Fact k="Submitted" v={day(k.submitted_at)} />
        <Fact k="Documents" v={<span className="chips"><button className="link" onClick={() => openDoc(k.id_doc_path)}>Government ID ↗</button><button className="link" onClick={() => openDoc(k.address_doc_path)}>Proof of address ↗</button></span>} />
      </dl>
      {k.status === 'rejected' && k.rejection_reason ? <div className="banner err">{k.rejection_reason}</div> : null}
      {k.status === 'pending' ? <Decide reasons={['ID photo is unclear or cut off', "Name doesn't match the ID", 'Proof of address is older than 3 months', 'Address on the document is different']}
        onApprove={() => run('admin_set_kyc', { p_user: k.user_id, p_status: 'approved' }, k.full_name + ' can now invest.')}
        onReject={(r) => run('admin_set_kyc', { p_user: k.user_id, p_status: 'rejected', p_reason: r }, k.full_name + ' was asked to resubmit.')} /> : null}
    </article>))}</div>;
}

function Badges({ rows, run }) {
  if (!rows.length) return <Empty title="No badge applications yet" body="Verified farms apply from Raise funds in the app." />;
  return <div className="cards">{rows.map((b) => (
    <article key={b.user_id} className="item">
      <div className="row between gap-sm wrap"><span className="strong">{b.business_name}</span><span className={'pill ' + PILL[b.investment_badge]}>{LABEL[b.investment_badge]}</span></div>
      <dl className="facts">
        <Fact k="Location" v={b.location || '—'} /><Fact k="Email" v={b.email || '—'} />
        <Fact k="Seller status" v={b.verification_status === 'approved' ? 'Verified seller' : 'Not a verified seller'} />
        <Fact k="Documents" v={(b.investment_docs || []).length ? <span className="chips">{b.investment_docs.map((p, i) => <button key={p} className="link" onClick={() => openDoc(p)}>Document {i + 1} ↗</button>)}</span> : 'None uploaded'} />
      </dl>
      {b.investment_badge === 'rejected' && b.investment_badge_reason ? <div className="banner err">{b.investment_badge_reason}</div> : null}
      {b.investment_badge === 'pending' ? <Decide approveLabel="Approve badge" reasons={['CAC certificate is missing', 'Farm photos are unclear', 'Farm records cover less than 6 months']}
        onApprove={() => run('admin_set_badge', { p_user: b.user_id, p_status: 'approved' }, b.business_name + ' can now raise funds.')}
        onReject={(r) => run('admin_set_badge', { p_user: b.user_id, p_status: 'rejected', p_reason: r }, b.business_name + ' was asked to reapply.')} /> : null}
      {b.investment_badge === 'approved' ? <RevokeBadge b={b} run={run} /> : null}
    </article>))}</div>;
}

function RevokeBadge({ b, run }) {
  const revoke = async () => {
    const r = window.prompt('Revoke the investment badge for ' + b.business_name + '?\nTheir open offerings are paused. Reason (shown to the farm):');
    if (!r || !r.trim()) return;
    const e = await run('admin_set_badge', { p_user: b.user_id, p_status: 'rejected', p_reason: r.trim() }, 'Badge revoked. Open offerings are paused.');
    if (e) alert(e);
  };
  return <div className="actions"><button className="btn ghost sm danger-text" onClick={revoke}>Revoke badge</button></div>;
}

// Offerings and pools share review, activation and payout controls.
function Targets({ kind, rows, run }) {
  if (!rows.length) return <Empty title={kind === 'pool' ? 'No pools yet' : 'No offerings yet'} body={kind === 'pool' ? 'Create one above from farms that hold a badge.' : 'Farms submit offerings from Raise funds in the app.'} />;
  return <div className="cards">{rows.map((o) => <Target key={o.id} kind={kind} o={o} run={run} />)}</div>;
}

function Target({ kind, o, run }) {
  const [profit, setProfit] = useState('');
  const [final, setFinal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const raised = Number(o.raised_amount);
  const total = Number(profit || 0) + (final ? raised : 0);
  const act = async (fn, args, done, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setErr(null); const e = await run(fn, args, done); setBusy(false); if (e) setErr(e); else { setProfit(''); setFinal(false); }
  };
  return (
    <article className="item">
      <div className="row between gap-sm wrap"><span className="strong">{o.title}</span><span className={'pill ' + PILL[o.status]}>{LABEL[o.status] || o.status}</span></div>
      <div className="meter"><div style={{ width: Math.min(100, (raised / Number(o.target_amount || 1)) * 100) + '%' }} /></div>
      <dl className="facts">
        {kind === 'offering' ? <Fact k="Farm" v={o.farm} /> : <Fact k="Farms" v={(o.farms || []).map((f) => f.name + ' ' + Number(f.allocation_pct) + '%').join(' · ') || '—'} />}
        <Fact k="Raised" v={<span className="mono">{naira(raised)} of {naira(o.target_amount)} · {o.investors} investor{o.investors === 1 ? '' : 's'}</span>} />
        <Fact k="Terms" v={Number(o.projected_roi_pct) + '% projected over ' + o.duration_months + ' months · min ' + naira(o.min_ticket) + (o.payout_schedule === 'monthly' ? ' · monthly payouts' : '')} />
        <Fact k={o.started_at ? 'Started' : 'Closes'} v={day(o.started_at || o.closes_at)} />
        {o.returns_paid > 0 ? <Fact k="Returns paid" v={<span className="mono">{naira(o.returns_paid)}</span>} /> : null}
        {kind === 'offering' && ['funded', 'active'].includes(o.status) ? <Fact k="Farm wallet" v={<span className="mono">{naira(o.farm_wallet)}</span>} /> : null}
        {o.summary ? <Fact k="About" v={o.summary} /> : null}
        {o.use_of_funds ? <Fact k="Use of funds" v={o.use_of_funds} /> : null}
      </dl>
      {o.status === 'rejected' && o.review_note ? <div className="banner err">{o.review_note}</div> : null}
      {err ? <p className="error">{err}</p> : null}
      {o.status === 'pending_review' ? <Decide approveLabel="Approve and open" reasons={['Projected return looks unrealistic', 'Use of funds is too vague', 'Target is too high for this farm']}
        onApprove={() => run('admin_review_offering', { p_id: o.id, p_approve: true }, o.title + ' is open to investors.')}
        onReject={(r) => run('admin_review_offering', { p_id: o.id, p_approve: false, p_note: r }, 'Sent back to the farm for changes.')} /> : null}
      {o.status === 'funded' ? <div className="actions"><button className="btn primary sm" disabled={busy} onClick={() => act('admin_activate_investment', { p_kind: kind, p_target: o.id }, 'Term started. ' + naira(raised) + ' released.',
        'Start the term and release ' + naira(raised) + (kind === 'pool' ? ' to the pool farms by allocation?' : " to the farm's wallet?"))}>{busy ? 'Starting…' : 'Start term and release ' + naira(raised)}</button></div> : null}
      {o.status === 'active' ? (
        <div className="payout">
          <p className="label">Pay out returns</p>
          <div className="row gap-sm wrap">
            <input className="input pay-in mono" inputMode="numeric" placeholder="Profit to share (₦)" value={profit} onChange={(e) => setProfit(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Profit to distribute" />
            <label className="check"><input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} /> Final payout (also return {naira(raised)} principal)</label>
          </div>
          <p className="muted small">Taken from the farm wallet{kind === 'pool' ? 's by allocation' : ''}: <span className="mono">{naira(total)}</span>. Shared between investors in proportion to what they put in.</p>
          <div className="actions"><button className="btn primary sm" disabled={busy || (!Number(profit) && !final)} onClick={() => act('admin_distribute_returns', { p_kind: kind, p_target: o.id, p_profit: Number(profit || 0), p_final: final },
            final ? 'Final payout done. Investment matured.' : naira(profit) + ' paid to investors.', 'Pay ' + naira(total) + ' to investors' + (final ? ' and close this investment?' : '?'))}>{busy ? 'Paying…' : final ? 'Pay out and close' : 'Pay out returns'}</button></div>
        </div>
      ) : null}
    </article>
  );
}

function Pools({ rows, farms, run }) {
  const blank = { title: '', summary: '', target: '', min: '25000', roi: '', months: '6', closes: new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10) };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [alloc, setAlloc] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErr(null); };
  const picked = Object.entries(alloc).filter(([, v]) => Number(v) > 0);
  const sum = Math.round(picked.reduce((s, [, v]) => s + Number(v), 0) * 100) / 100;   // avoid 33.33 + 33.33 + 33.34 float drift
  const even = () => { const n = farms.length; if (!n) return; const each = Math.floor(10000 / n) / 100; const a = {}; farms.forEach((x, i) => { a[x.user_id] = String(i === n - 1 ? Math.round((100 - each * (n - 1)) * 100) / 100 : each); }); setAlloc(a); };
  const submit = async (e) => {
    e.preventDefault();
    if (sum !== 100) return setErr('Allocations must add up to 100% (currently ' + sum + '%).');
    setBusy(true);
    const er = await run('admin_create_pool', { p_title: f.title, p_summary: f.summary, p_target: Number(f.target), p_min_ticket: Number(f.min), p_roi: Number(f.roi), p_months: Number(f.months),
      p_closes_at: f.closes + 'T23:59:00+01:00', p_farms: picked.map(([vendor_id, v]) => ({ vendor_id, allocation_pct: Number(v) })) }, 'Pool created and open to investors.');
    setBusy(false);
    if (er) setErr(er); else { setOpen(false); setF(blank); setAlloc({}); }
  };
  return (
    <>
      {!open ? <div className="actions start"><button className="btn primary" disabled={!farms.length} onClick={() => setOpen(true)}>+ Create pool</button>{!farms.length ? <span className="muted small">Approve at least one farm badge first.</span> : null}</div> : (
        <form className="item form" onSubmit={submit}>
          <h2>New pool</h2>
          <label className="field"><span className="field-label">Title</span><input className="input" required value={f.title} onChange={set('title')} placeholder="Port Harcourt Layers Pool · Q1" /></label>
          <label className="field"><span className="field-label">Summary</span><textarea className="input" rows={2} value={f.summary} onChange={set('summary')} placeholder="Three verified layer farms in Rivers State" /></label>
          <div className="grid2">
            <label className="field"><span className="field-label">Target (₦)</span><input className="input mono" required inputMode="numeric" value={f.target} onChange={set('target')} placeholder="5000000" /></label>
            <label className="field"><span className="field-label">Minimum investment (₦)</span><input className="input mono" required inputMode="numeric" value={f.min} onChange={set('min')} /></label>
            <label className="field"><span className="field-label">Projected return over the term (%)</span><input className="input mono" required inputMode="decimal" value={f.roi} onChange={set('roi')} placeholder="15" /></label>
            <label className="field"><span className="field-label">Term (months)</span><input className="input mono" required inputMode="numeric" value={f.months} onChange={set('months')} /></label>
          </div>
          <label className="field"><span className="field-label">Closing date</span><input className="input" type="date" required value={f.closes} onChange={set('closes')} /></label>
          <div className="field"><div className="row between"><span className="field-label">Farms and allocation ({sum}% of 100%)</span><button type="button" className="link" onClick={even}>Split evenly</button></div>
            {farms.map((x) => (
              <div key={x.user_id} className="row gap-sm alloc"><span className="grow">{x.business_name}<span className="muted small"> · {x.location || 'no location'}</span></span>
                <input className="input mono pct-in" inputMode="decimal" placeholder="0" value={alloc[x.user_id] || ''} onChange={(e) => { setAlloc((a) => ({ ...a, [x.user_id]: e.target.value.replace(/[^\d.]/g, '') })); setErr(null); }} aria-label={'Allocation for ' + x.business_name} /><span className="muted">%</span></div>))}
          </div>
          {err ? <p className="error">{err}</p> : null}
          <div className="actions"><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create pool'}</button></div>
        </form>
      )}
      <Targets kind="pool" rows={rows} run={run} />
    </>
  );
}
