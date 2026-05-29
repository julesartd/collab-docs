import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ROLE_LABEL = { USER: 'Utilisateur', ADMIN: 'Administrateur', SUPERADMIN: 'Super Admin' };

export function AdminPage() {
  const { token, user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPERADMIN';

  const [users, setUsers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [actionError, setActionError] = useState('');

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'USER' });
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  async function fetchUsers() {
    const r = await fetch(`${API}/api/users`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) setUsers(await r.json());
  }

  useEffect(() => { fetchUsers(); }, []);

  async function toggleBlock(u) {
    setActionError('');
    const r = await fetch(`${API}/api/users/${u.id}/block`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ blocked: !u.isBlocked }),
    });
    if (r.ok) fetchUsers();
    else { const d = await r.json(); setActionError(d.error || 'Erreur'); }
  }

  async function changeRole(u, role) {
    setActionError('');
    const r = await fetch(`${API}/api/users/${u.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    });
    if (r.ok) fetchUsers();
    else { const d = await r.json(); setActionError(d.error || 'Erreur'); }
  }

  async function createUser(e) {
    e.preventDefault();
    setFormError('');
    if (!form.name || !form.email || !form.password) return setFormError('Tous les champs sont requis.');
    if (form.password.length < 8) return setFormError('Le mot de passe doit faire au moins 8 caractères.');
    setFormSaving(true);
    const r = await fetch(`${API}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    setFormSaving(false);
    if (r.ok) { setShowCreate(false); setForm({ name: '', email: '', password: '', role: 'USER' }); fetchUsers(); }
    else { const d = await r.json(); setFormError(d.error || 'Erreur'); }
  }

  const canBlock = (u) => {
    if (u.role === 'SUPERADMIN') return false;
    if (u.id === user?.id) return false;
    return true;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Administration</h1>
          <Button onClick={() => { setShowCreate(true); setFormError(''); }}>Créer un compte</Button>
        </div>

        {actionError && <p className="text-sm text-red-500">{actionError}</p>}

        {/* Modal création */}
        {showCreate && (
          <Card>
            <CardHeader><CardTitle>Nouveau compte</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={createUser} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Nom</Label>
                    <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Prénom Nom" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
                  </div>
                  <div>
                    <Label>Mot de passe</Label>
                    <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Rôle</Label>
                    <select
                      value={form.role}
                      onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      className="w-full border rounded-md px-3 py-2 text-sm"
                    >
                      <option value="USER">Utilisateur</option>
                      <option value="ADMIN">Administrateur</option>
                      {isSuperAdmin && <option value="SUPERADMIN">Super Admin</option>}
                    </select>
                  </div>
                </div>
                {formError && <p className="text-sm text-red-500">{formError}</p>}
                <div className="flex gap-2">
                  <Button type="submit" disabled={formSaving}>{formSaving ? 'Création…' : 'Créer'}</Button>
                  <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Tableau utilisateurs */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Nom</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Rôle</th>
                  <th className="text-left px-4 py-3 font-medium">MFA</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  <th className="text-left px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map(u => (
                  <tr key={u.id} className={u.isBlocked ? 'opacity-50' : ''}>
                    <td className="px-4 py-3">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      {isSuperAdmin && u.id !== user?.id && u.role !== 'SUPERADMIN' ? (
                        <select
                          value={u.role}
                          onChange={e => changeRole(u, e.target.value)}
                          className="border rounded px-2 py-1 text-xs"
                        >
                          <option value="USER">Utilisateur</option>
                          <option value="ADMIN">Administrateur</option>
                          <option value="SUPERADMIN">Super Admin</option>
                        </select>
                      ) : (
                        <span>{ROLE_LABEL[u.role] ?? u.role}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={u.totpEnabled ? 'text-green-600' : 'text-muted-foreground'}>
                        {u.totpEnabled ? 'Activé' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={u.isBlocked ? 'text-red-500' : 'text-green-600'}>
                        {u.isBlocked ? 'Bloqué' : 'Actif'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canBlock(u) && (
                        <Button
                          size="sm"
                          variant={u.isBlocked ? 'outline' : 'destructive'}
                          onClick={() => toggleBlock(u)}
                        >
                          {u.isBlocked ? 'Débloquer' : 'Bloquer'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Aucun utilisateur.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
