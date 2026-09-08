import { useState } from 'react';
import { Button, Card, InputGroup, TextField } from '@heroui/react';
import { api } from '../api';

export function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-background text-foreground">
      <Card className="w-full max-w-sm">
        <Card.Content>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-center">
            <h1 className="text-2xl font-bold">ccaas</h1>
            <p className="text-muted text-sm">Run an AI coding agent in the cloud, in your own sandbox.</p>

            <TextField aria-label="Username" value={username} onChange={setUsername} autoFocus>
              <InputGroup>
                <InputGroup.Input placeholder="username"/>
              </InputGroup>
            </TextField>
            <TextField aria-label="Password" value={password} onChange={setPassword}>
              <InputGroup>
                <InputGroup.Input placeholder="password" type="password"/>
              </InputGroup>
            </TextField>

            <Button type="submit" isDisabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
            {error && <p className="text-danger text-sm">{error}</p>}
          </form>
        </Card.Content>
      </Card>
    </div>
  );
}
