import { useEffect, useState } from 'react';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { api } from './api';

export function App() {
  const [state, setState] = useState({ loading: true, email: null });

  useEffect(() => {
    api
      .me()
      .then((me) => setState({ loading: false, email: me.email }))
      .catch(() => setState({ loading: false, email: null }));
  }, []);

  if (state.loading) return null;

  if (!state.email) {
    return (
      <Login
        onLoggedIn={() => {
          api.me().then((me) => setState({ loading: false, email: me.email }));
        }}
      />
    );
  }

  return (
    <Dashboard
      email={state.email}
      onLogout={async () => {
        await api.logout();
        setState({ loading: false, email: null });
      }}
    />
  );
}
