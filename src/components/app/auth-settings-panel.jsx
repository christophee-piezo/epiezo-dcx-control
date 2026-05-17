import { useEffect, useState } from 'react';
import { Clock3, ShieldCheck, UserPlus, UsersRound } from 'lucide-react';

import { Badge } from '../ui/badge.jsx';
import { Button } from '../ui/button.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';
import { Input } from '../ui/input.jsx';
import { NativeSelect } from '../ui/native-select.jsx';
import { FormField } from './form-field.jsx';

function formatRole(role) {
  return role === 'admin' ? 'Administrator' : 'Operator';
}

function formatTimestamp(value) {
  if (!value) {
    return 'Not available';
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return 'Not available';
  }

  return timestamp.toLocaleString();
}

function FeedbackBanner({ message, tone = 'default' }) {
  if (!message) {
    return null;
  }

  const className = tone === 'success'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
    : tone === 'error'
      ? 'border-red-500/30 bg-red-500/10 text-red-100'
      : 'border-border/70 bg-background/70 text-foreground';

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${className}`} role="status">
      {message}
    </div>
  );
}

export function AuthSettingsPanel({
  busyAction = '',
  currentUser = null,
  feedback = '',
  feedbackTone = 'default',
  onChangePassword,
  onCreateUser,
  onDeleteUser,
  onResetUserPassword,
  onUpdateSessionTimeout,
  onUpdateUser,
  settings = {},
  users = []
}) {
  const isAdmin = currentUser?.role === 'admin';
  const [timeoutMinutes, setTimeoutMinutes] = useState(String(settings.sessionTimeoutMinutes ?? 15));
  const [timeoutError, setTimeoutError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newUserRole, setNewUserRole] = useState('operator');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [confirmNewUserPassword, setConfirmNewUserPassword] = useState('');
  const [createUserError, setCreateUserError] = useState('');
  const [resetPasswordErrors, setResetPasswordErrors] = useState({});

  useEffect(() => {
    setTimeoutMinutes(String(settings.sessionTimeoutMinutes ?? 15));
  }, [settings.sessionTimeoutMinutes]);

  async function handleChangePasswordSubmit(event) {
    event.preventDefault();
    setPasswordError('');

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    const result = await onChangePassword?.({ currentPassword, newPassword });
    if (result?.success) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    }
  }

  async function handleCreateUserSubmit(event) {
    event.preventDefault();
    setCreateUserError('');

    if (newUserPassword !== confirmNewUserPassword) {
      setCreateUserError('Passwords do not match.');
      return;
    }

    const result = await onCreateUser?.({
      username: newUsername,
      password: newUserPassword,
      role: newUserRole
    });

    if (result?.success) {
      setNewUsername('');
      setNewUserRole('operator');
      setNewUserPassword('');
      setConfirmNewUserPassword('');
    }
  }

  async function handleTimeoutSubmit(event) {
    event.preventDefault();
    setTimeoutError('');

    const parsedMinutes = Number(timeoutMinutes);
    if (!Number.isInteger(parsedMinutes) || parsedMinutes < 1 || parsedMinutes > 480) {
      setTimeoutError('Session timeout must be between 1 and 480 minutes.');
      return;
    }

    await onUpdateSessionTimeout?.({ sessionTimeoutMinutes: parsedMinutes });
  }

  const isSavingTimeout = busyAction === 'updateTimeout';
  const isChangingPassword = busyAction === 'changePassword';
  const isCreatingUser = busyAction === 'createUser';
  const isUpdatingUser = (userId) => busyAction === `updateUser:${userId}`;
  const isDeletingUser = (userId) => busyAction === `deleteUser:${userId}`;
  const isResettingPassword = (userId) => busyAction === `resetPassword:${userId}`;

  return (
    <div className="grid gap-4">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>
            Manage the signed-in account, local access policy, and auto-lock behavior for this console.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FeedbackBanner message={feedback} tone={feedbackTone} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <section className="rounded-2xl border border-border/70 bg-background/55 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Current Account</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    The active session can operate the control console immediately after sign-in.
                  </p>
                </div>

                <div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary">
                  <ShieldCheck className="size-5" />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Username</div>
                  <div className="mt-2 text-sm font-medium text-foreground">{currentUser?.username || '--'}</div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Role</div>
                  <div className="mt-2">
                    <Badge className="border-primary/20 bg-primary/10 text-primary" variant="outline">
                      {formatRole(currentUser?.role)}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Session Timeout</div>
                  <div className="mt-2 text-sm font-medium text-foreground">{settings.sessionTimeoutMinutes ?? 15} minutes</div>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-3">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Last Password Change</div>
                  <div className="mt-2 text-sm font-medium text-foreground">{formatTimestamp(currentUser?.updatedAt)}</div>
                </div>
              </div>

              {currentUser?.isSystemAdmin ? (
                <div className="mt-4 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                  Built-in administrator account. Username is fixed to <span className="font-semibold">admin</span> and cannot be deleted or restricted.
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border/70 bg-background/55 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-border/60 bg-background/70 p-2 text-muted-foreground">
                  <Clock3 className="size-5" />
                </div>

                <div>
                  <div className="text-sm font-semibold text-foreground">Auto-Lock Policy</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    The app signs out after this many idle minutes. Only administrators can change the policy.
                  </p>
                </div>
              </div>

              <form className="mt-4 space-y-3" onSubmit={handleTimeoutSubmit}>
                <FormField label="Session Timeout (minutes)">
                  <Input
                    disabled={!isAdmin || isSavingTimeout}
                    min="1"
                    max="480"
                    onChange={(event) => setTimeoutMinutes(event.target.value)}
                    type="number"
                    value={timeoutMinutes}
                  />
                </FormField>

                {timeoutError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert">
                    {timeoutError}
                  </div>
                ) : null}

                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs leading-5 text-muted-foreground">
                    Accepted range: 1 to 480 minutes.
                  </p>
                  <Button disabled={!isAdmin || isSavingTimeout} size="sm" type="submit">
                    {isSavingTimeout ? 'Saving...' : 'Save Policy'}
                  </Button>
                </div>
              </form>
            </section>
          </div>

          <section className="rounded-2xl border border-border/70 bg-background/55 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Change Password</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Update the password used to unlock this machine. The current password is required.
                </p>
              </div>
            </div>

            <form className="mt-4 grid gap-4 lg:grid-cols-3" onSubmit={handleChangePasswordSubmit}>
              <FormField label="Current Password">
                <Input
                  autoComplete="current-password"
                  disabled={isChangingPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  type="password"
                  value={currentPassword}
                />
              </FormField>

              <FormField label="New Password">
                <Input
                  autoComplete="new-password"
                  disabled={isChangingPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  type="password"
                  value={newPassword}
                />
              </FormField>

              <FormField label="Confirm New Password">
                <Input
                  autoComplete="new-password"
                  disabled={isChangingPassword}
                  onChange={(event) => setConfirmNewPassword(event.target.value)}
                  type="password"
                  value={confirmNewPassword}
                />
              </FormField>

              {passwordError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100 lg:col-span-3" role="alert">
                  {passwordError}
                </div>
              ) : null}

              <div className="flex justify-end lg:col-span-3">
                <Button disabled={isChangingPassword} type="submit">
                  {isChangingPassword ? 'Updating Password...' : 'Update Password'}
                </Button>
              </div>
            </form>
          </section>
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Local Users</CardTitle>
            <CardDescription>
              Administrators can create additional operator or administrator accounts for this console.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <section className="rounded-2xl border border-border/70 bg-background/55 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Configured Accounts</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Every account is stored locally. The built-in admin can grant, restrict, change roles, or delete other users.
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-2 text-muted-foreground">
                  <UsersRound className="size-5" />
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {users.map((user) => (
                  <div className="rounded-xl border border-border/60 bg-background/70 p-4" key={user.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{user.username}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Updated {formatTimestamp(user.updatedAt)}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        {user.id === currentUser?.id ? (
                          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200" variant="outline">
                            Current
                          </Badge>
                        ) : null}
                        {!user.enabled ? (
                          <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-200" variant="outline">
                            Restricted
                          </Badge>
                        ) : null}
                        {user.isSystemAdmin ? (
                          <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200" variant="outline">
                            Built-In
                          </Badge>
                        ) : null}
                        <Badge className="border-primary/20 bg-primary/10 text-primary" variant="outline">
                          {formatRole(user.role)}
                        </Badge>
                      </div>
                    </div>

                    {user.isSystemAdmin ? (
                      <div className="mt-4 rounded-xl border border-border/60 bg-background/55 px-3 py-2 text-sm text-muted-foreground">
                        This account is permanently enabled and always uses the username <span className="font-medium text-foreground">admin</span>.
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-4">
                        <form
                          className="grid gap-3"
                          onSubmit={async (event) => {
                            event.preventDefault();
                            const formData = new FormData(event.currentTarget);
                            await onUpdateUser?.({
                              userId: user.id,
                              role: String(formData.get('role') || 'operator'),
                              enabled: String(formData.get('enabled') || 'true') === 'true'
                            });
                          }}
                        >
                          <div className="grid gap-3 sm:grid-cols-2">
                            <FormField label="Role">
                              <NativeSelect
                                defaultValue={user.role}
                                disabled={isUpdatingUser(user.id) || isDeletingUser(user.id) || isResettingPassword(user.id)}
                                name="role"
                              >
                                <option value="operator">Operator</option>
                                <option value="admin">Administrator</option>
                              </NativeSelect>
                            </FormField>

                            <FormField label="Access">
                              <NativeSelect
                                defaultValue={String(user.enabled !== false)}
                                disabled={isUpdatingUser(user.id) || isDeletingUser(user.id) || isResettingPassword(user.id)}
                                name="enabled"
                              >
                                <option value="true">Granted</option>
                                <option value="false">Restricted</option>
                              </NativeSelect>
                            </FormField>
                          </div>

                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              disabled={isDeletingUser(user.id) || isUpdatingUser(user.id) || isResettingPassword(user.id)}
                              size="sm"
                              type="submit"
                              variant="outline"
                            >
                              {isUpdatingUser(user.id) ? 'Saving...' : 'Save Access'}
                            </Button>
                            <Button
                              disabled={isDeletingUser(user.id) || isUpdatingUser(user.id) || isResettingPassword(user.id)}
                              onClick={() => onDeleteUser?.({ userId: user.id })}
                              size="sm"
                              type="button"
                              variant="destructive"
                            >
                              {isDeletingUser(user.id) ? 'Deleting...' : 'Delete User'}
                            </Button>
                          </div>
                        </form>

                        {user.id !== currentUser?.id ? (
                          <div className="rounded-xl border border-border/60 bg-background/55 p-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Reset Password</div>
                            <p className="mt-2 text-xs leading-5 text-muted-foreground">
                              Administrators can set a new password for this account without the current password.
                            </p>

                            <form
                              className="mt-4 grid gap-3"
                              onSubmit={async (event) => {
                                event.preventDefault();
                                setResetPasswordErrors((current) => ({ ...current, [user.id]: '' }));

                                const formData = new FormData(event.currentTarget);
                                const newPassword = String(formData.get('newPassword') || '');
                                const confirmNewPassword = String(formData.get('confirmNewPassword') || '');

                                if (newPassword !== confirmNewPassword) {
                                  setResetPasswordErrors((current) => ({
                                    ...current,
                                    [user.id]: 'Passwords do not match.'
                                  }));
                                  return;
                                }

                                const result = await onResetUserPassword?.({ userId: user.id, newPassword });
                                if (result?.success) {
                                  setResetPasswordErrors((current) => ({ ...current, [user.id]: '' }));
                                  event.currentTarget.reset();
                                }
                              }}
                            >
                              <div className="grid gap-3 sm:grid-cols-2">
                                <FormField label="New Password">
                                  <Input
                                    autoComplete="new-password"
                                    disabled={isUpdatingUser(user.id) || isDeletingUser(user.id) || isResettingPassword(user.id)}
                                    name="newPassword"
                                    type="password"
                                  />
                                </FormField>

                                <FormField label="Confirm Password">
                                  <Input
                                    autoComplete="new-password"
                                    disabled={isUpdatingUser(user.id) || isDeletingUser(user.id) || isResettingPassword(user.id)}
                                    name="confirmNewPassword"
                                    type="password"
                                  />
                                </FormField>
                              </div>

                              {resetPasswordErrors[user.id] ? (
                                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100" role="alert">
                                  {resetPasswordErrors[user.id]}
                                </div>
                              ) : null}

                              <div className="flex justify-end">
                                <Button
                                  disabled={isUpdatingUser(user.id) || isDeletingUser(user.id) || isResettingPassword(user.id)}
                                  size="sm"
                                  type="submit"
                                >
                                  {isResettingPassword(user.id) ? 'Resetting Password...' : 'Reset Password'}
                                </Button>
                              </div>
                            </form>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-background/55 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Create User</div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Add another local account. The username <span className="font-medium text-foreground">admin</span> is reserved for the built-in administrator.
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-background/70 p-2 text-muted-foreground">
                  <UserPlus className="size-5" />
                </div>
              </div>

              <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={handleCreateUserSubmit}>
                <FormField label="Username">
                  <Input
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={isCreatingUser}
                    onChange={(event) => setNewUsername(event.target.value)}
                    spellCheck={false}
                    value={newUsername}
                  />
                </FormField>

                <FormField label="Role">
                  <NativeSelect
                    disabled={isCreatingUser}
                    onChange={(event) => setNewUserRole(event.target.value)}
                    value={newUserRole}
                  >
                    <option value="operator">Operator</option>
                    <option value="admin">Administrator</option>
                  </NativeSelect>
                </FormField>

                <FormField label="Password">
                  <Input
                    autoComplete="new-password"
                    disabled={isCreatingUser}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    type="password"
                    value={newUserPassword}
                  />
                </FormField>

                <FormField label="Confirm Password">
                  <Input
                    autoComplete="new-password"
                    disabled={isCreatingUser}
                    onChange={(event) => setConfirmNewUserPassword(event.target.value)}
                    type="password"
                    value={confirmNewUserPassword}
                  />
                </FormField>

                {createUserError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100 lg:col-span-2" role="alert">
                    {createUserError}
                  </div>
                ) : null}

                <div className="flex justify-end lg:col-span-2">
                  <Button disabled={isCreatingUser} type="submit">
                    {isCreatingUser ? 'Creating User...' : 'Create User'}
                  </Button>
                </div>
              </form>
            </section>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
