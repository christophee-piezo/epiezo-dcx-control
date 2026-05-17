import { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';

import { FormField } from './form-field.jsx';
import { Button } from '../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';
import { Input } from '../ui/input.jsx';

const SCREEN_COPY = {
  login: {
    eyebrow: 'Local Authentication',
    title: 'Unlock the control console',
    description: 'Sign in with a local account configured on this machine. The built-in administrator username is admin.',
    actionLabel: 'Sign In',
    busyLabel: 'Signing In...'
  },
  setup: {
    eyebrow: 'First-Time Setup',
    title: 'Create the first administrator account',
    description: 'Set the first local administrator credentials before anyone can access the control workspace.',
    actionLabel: 'Create Account',
    busyLabel: 'Creating Account...'
  }
};

export function AuthScreen({ busy = false, error = '', mode = 'login', onLogin, onSetup }) {
  const isSetup = mode === 'setup';
  const copy = isSetup ? SCREEN_COPY.setup : SCREEN_COPY.login;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setPassword('');
    setConfirmPassword('');
    setLocalError('');
  }, [mode]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLocalError('');

    if (isSetup && password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    const submit = isSetup ? onSetup : onLogin;
    await submit?.({ username, password });
  }

  const resolvedError = localError || error;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-950/76 backdrop-blur-md" />

      <div className="relative w-full max-w-lg">
        <Card className="border-primary/20 bg-slate-950/86 shadow-[0_40px_140px_-56px_rgba(14,165,233,0.55)]">
          <CardHeader className="space-y-4 pb-5">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary">
                {isSetup ? <ShieldCheck className="size-6" /> : <LockKeyhole className="size-6" />}
              </div>

              <div className="min-w-0">
                <div className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-primary/80">{copy.eyebrow}</div>
                <CardTitle className="mt-3 text-left text-lg font-semibold normal-case tracking-normal text-foreground sm:text-xl">
                  {copy.title}
                </CardTitle>
                <CardDescription className="mt-2 leading-6">
                  {copy.description}
                </CardDescription>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/70 p-4 text-sm leading-6 text-muted-foreground">
              Credentials are stored locally on this machine. Passwords are hashed in the Electron store, and administrators can add more local users after sign-in.
            </div>
          </CardHeader>

          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <FormField label="Username">
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect="off"
                    autoFocus
                    className="pl-10"
                    disabled={busy}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="operator"
                    spellCheck={false}
                    value={username}
                  />
                </div>
              </FormField>

              <FormField label="Password">
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoComplete={isSetup ? 'new-password' : 'current-password'}
                    className="pl-10"
                    disabled={busy}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={isSetup ? 'Minimum 5 characters' : 'Enter your password'}
                    type="password"
                    value={password}
                  />
                </div>
              </FormField>

              {isSetup ? (
                <FormField label="Confirm Password">
                  <Input
                    autoComplete="new-password"
                    disabled={busy}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat the password"
                    type="password"
                    value={confirmPassword}
                  />
                </FormField>
              ) : null}

              {resolvedError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
                  {resolvedError}
                </div>
              ) : null}

              <Button className="w-full" disabled={busy} type="submit">
                {busy ? copy.busyLabel : copy.actionLabel}
              </Button>

              <p className="text-xs leading-5 text-muted-foreground">
                {isSetup
                  ? 'Create this first administrator account once, then add operator or administrator users later from Settings.'
                  : 'This sign-in only protects this local console. Default administrator credentials start as admin / admin until the password is changed.'}
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
