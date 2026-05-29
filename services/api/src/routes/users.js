import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { requireAuth, requireAdmin, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, email: true, name: true, role: true, totpEnabled: true, createdAt: true }
  });
  res.json(user);
});

router.patch('/me', requireAuth, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  const data = {};

  if (name) data.name = name;

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis' });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!await bcrypt.compare(currentPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }
    data.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  if (!Object.keys(data).length) return res.status(400).json({ error: 'Rien à mettre à jour' });
  await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ success: true });
});

router.get('/search', requireAuth, async (req, res) => {
  const { q = '' } = req.query;
  const users = await prisma.user.findMany({
    where: {
      isBlocked: false,
      id: { not: req.user.id },
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } }
      ]
    },
    select: { id: true, name: true, email: true },
    take: 10
  });
  res.json(users);
});

router.get('/', requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, isBlocked: true, totpEnabled: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(users);
});

router.post('/', requireAdmin, async (req, res) => {
  const { email, name, password, role = 'USER' } = req.body;

  if (role === 'SUPERADMIN' && req.user.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Accès refusé' });
  }

  try {
    const user = await prisma.user.create({
      data: { email, name, passwordHash: await bcrypt.hash(password, 10), role },
      select: { id: true, email: true, name: true, role: true }
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email déjà utilisé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/:id/block', requireAdmin, async (req, res) => {
  const { blocked } = req.body;
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (target.role === 'SUPERADMIN') return res.status(403).json({ error: 'Impossible de bloquer le superadmin' });
  if (target.id === req.user.id) return res.status(403).json({ error: 'Impossible de se bloquer soi-même' });
  await prisma.user.update({ where: { id: req.params.id }, data: { isBlocked: blocked } });
  res.json({ success: true });
});

router.patch('/:id/role', requireSuperAdmin, async (req, res) => {
  const { role } = req.body;
  if (!['USER', 'ADMIN', 'SUPERADMIN'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (target.id === req.user.id) return res.status(403).json({ error: 'Impossible de modifier son propre rôle' });
  await prisma.user.update({ where: { id: req.params.id }, data: { role } });
  res.json({ success: true });
});

export default router;
