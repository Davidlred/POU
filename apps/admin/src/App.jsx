import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import SignIn, { SetPassword } from './SignIn';
import Farms from './Farms';
import Riders from './Riders';
import Invest from './Invest';
import Vets from './Vets';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [admin, setAdmin] = useState(undefined);
  const [reset, setReset] = useState(false);          // true while the signed-in user is choosing a new password

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user?.id;
  const hasPassword = !!session?.user?.user_metadata?.has_password;   // set by the apps and by SetPassword
  useEffect(() => {
    if (!uid) { setAdmin(undefined); return; }
    let live = true;
    supabase.rpc('is_admin').then(({ data, error }) => live && setAdmin(!error && !!data));
    return () => { live = false; };
  }, [uid]);

  if (session === undefined || (session && admin === undefined)) return <div className="center"><div className="spinner" aria-label="Loading" /></div>;
  if (!session) return <SignIn onResetStarted={setReset} />;
  // Came in with a code (forgot password) or pressed "Password" in the top bar: choose a new one first.
  if (reset) return <SetPassword email={session.user.email} creating={!hasPassword} onDone={() => setReset(false)} />;
  if (!admin) return <NotAdmin email={session.user.email} />;
  // Admin account from before passwords existed: create one before using the dashboard.
  if (!hasPassword) return <SetPassword email={session.user.email} creating onDone={() => {}} />;
  return <Shell user={session.user} onChangePassword={() => setReset(true)} />;
}

const SECTIONS = [
  { id: 'farms', label: 'Verification', icon: '✓' },
  { id: 'riders', label: 'Riders', icon: '➜' },
  { id: 'vets', label: 'Vets', icon: '✚' },
  { id: 'invest', label: 'Investments', icon: '↗' },
];

// Dark-green sidebar (wordmark, Ops, nav with the pending count), page on the right. On a phone the sidebar is a top bar.
function Shell({ user, onChangePassword }) {
  const [section, setSection] = useState(() => (SECTIONS.some((s) => '#' + s.id === window.location.hash) ? window.location.hash.slice(1) : 'farms'));
  const [pending, setPending] = useState(0);
  const go = (id) => { setSection(id); window.location.hash = id; };
  // The pending count stays live even while another section is open.
  useEffect(() => {
    const count = () => supabase.rpc('admin_vendors').then(({ data }) => { if (Array.isArray(data)) setPending(data.filter((f) => f.verification_status === 'pending').length); });
    count();
    const ch = supabase.channel('ops-pending').on('postgres_changes', { event: '*', schema: 'public', table: 'vendor_profiles' }, count).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  return (
    <div className="shell">
      <aside className="side">
        <div className="side-brand"><img src="/logo-mark.png" alt="" className="side-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} /><span>Poultry360 <b>Ops</b></span></div>
        <nav className="side-nav" aria-label="Sections">
          {SECTIONS.map((s) => (
            <button key={s.id} className={'side-item' + (section === s.id ? ' on' : '')} aria-current={section === s.id ? 'page' : undefined} onClick={() => go(s.id)}>
              <span className="side-ico" aria-hidden="true">{s.icon}</span><span className="grow">{s.label}</span>
              {s.id === 'farms' && pending ? <span className="badge" aria-label={pending + ' pending'}>{pending}</span> : null}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <span className="side-email" title={user.email}>{user.email}</span>
          <div className="row gap-sm">
            <button className="side-link" onClick={onChangePassword}>Password</button>
            <button className="side-link" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </aside>
      <div className="content">
        {section === 'riders' ? <Riders /> : section === 'invest' ? <Invest /> : section === 'vets' ? <Vets /> : <Farms onPending={setPending} />}
      </div>
    </div>
  );
}

function NotAdmin({ email }) {
  return (
    <div className="center">
      <div className="auth">
        <div className="mark" />
        <h1>Not an ops account</h1>
        <p className="muted"><strong>{email}</strong> is signed in, but it isn't on the admin list.</p>
        <p className="muted small">Ask the project owner to run this in the Supabase SQL editor:</p>
        <pre className="code">{`insert into public.admin_emails (email)\nvalues ('${email}') on conflict do nothing;`}</pre>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}
