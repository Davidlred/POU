import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import SignIn from './SignIn';
import Farms from './Farms';
import Riders from './Riders';
import Invest from './Invest';
import Vets from './Vets';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [admin, setAdmin] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user?.id;
  useEffect(() => {
    if (!uid) { setAdmin(undefined); return; }
    let live = true;
    supabase.rpc('is_admin').then(({ data, error }) => live && setAdmin(!error && !!data));
    return () => { live = false; };
  }, [uid]);

  if (session === undefined || (session && admin === undefined)) return <div className="center"><div className="spinner" aria-label="Loading" /></div>;
  if (!session) return <SignIn />;
  if (!admin) return <NotAdmin email={session.user.email} />;
  return <Shell user={session.user} />;
}

const SECTIONS = [{ id: 'farms', label: 'Farms' }, { id: 'riders', label: 'Riders' }, { id: 'vets', label: 'Vets' }, { id: 'invest', label: 'Invest' }];

function Shell({ user }) {
  const [section, setSection] = useState(() => (SECTIONS.some((s) => '#' + s.id === window.location.hash) ? window.location.hash.slice(1) : 'farms'));
  const go = (id) => { setSection(id); window.location.hash = id; };
  return (
    <div className="shell">
      <header className="topbar">
        <div className="row gap">
          <div className="brand"><div className="mark sm" /><span className="hide-sm">Poultry360 <b>Ops</b></span></div>
          <nav className="tabs nav" aria-label="Sections">
            {SECTIONS.map((s) => <button key={s.id} className={'tab' + (section === s.id ? ' on' : '')} aria-current={section === s.id ? 'page' : undefined} onClick={() => go(s.id)}>{s.label}</button>)}
          </nav>
        </div>
        <div className="row gap">
          <span className="muted small hide-sm">{user.email}</span>
          <button className="btn ghost sm" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      {section === 'riders' ? <Riders /> : section === 'invest' ? <Invest /> : section === 'vets' ? <Vets /> : <Farms />}
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
        <pre className="code">{`insert into public.admins (user_id)\nselect id from auth.users where email = '${email}';`}</pre>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div>
  );
}
