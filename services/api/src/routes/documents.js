import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

const router = Router();
router.use(requireAuth);

function accessFilter(user) {
  if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') return {};
  return {
    OR: [
      { createdById: user.id },
      { permissions: { some: { userId: user.id } } }
    ]
  };
}
function isOwnerOrAdmin(doc, user) {
  return doc.createdById === user.id || user.role === 'ADMIN' || user.role === 'SUPERADMIN';
}

function findAccessibleDoc(id, user, select) {
  return prisma.document.findFirst({
    where: { id, deletedAt: null, ...accessFilter(user) },
    ...(select ? { select } : {})
  });
}

router.get('/', async (req, res) => {
  const { parent_id } = req.query;
  const docs = await prisma.document.findMany({
    where: { parentId: parent_id ?? null, deletedAt: null, ...accessFilter(req.user) },
    include: {
      lastModifiedBy: { select: { name: true } },
      _count: { select: { children: true, permissions: true } }
    },
    orderBy: [{ type: 'asc' }, { name: 'asc' }]
  });
  res.json(docs);
});

router.post('/', async (req, res) => {
  const { name, type, parent_id } = req.body;
  if (parent_id) {
    const parent = await findAccessibleDoc(parent_id, req.user, { id: true });
    if (!parent) return res.status(403).json({ error: 'Dossier parent inaccessible' });
  }
  const doc = await prisma.document.create({
    data: { name, type, parentId: parent_id ?? null, createdById: req.user.id, lastModifiedById: req.user.id }
  });
  res.status(201).json(doc);
});

router.get('/folders', async (req, res) => {
  const folders = await prisma.document.findMany({
    where: { type: 'FOLDER', deletedAt: null, ...accessFilter(req.user) },
    select: { id: true, name: true, parentId: true },
    orderBy: { name: 'asc' }
  });
  res.json(folders);
});

router.get('/:id', async (req, res) => {
  const doc = await findAccessibleDoc(req.params.id, req.user);
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  res.json(doc);
});

router.get('/:id/ancestors', async (req, res) => {
  const ancestors = [];
  let currentId = req.params.id;
  let first = true;
  while (currentId) {
    const where = first
      ? { id: currentId, deletedAt: null, ...accessFilter(req.user) }
      : { id: currentId, deletedAt: null };
    const doc = await prisma.document.findFirst({
      where,
      select: { id: true, name: true, parentId: true }
    });
    if (!doc) {
      if (first) return res.status(404).json({ error: 'Document introuvable' });
      break;
    }
    ancestors.unshift({ id: doc.id, name: doc.name });
    currentId = doc.parentId;
    first = false;
  }
  res.json(ancestors);
});

router.patch('/:id', async (req, res) => {
  const target = await findAccessibleDoc(req.params.id, req.user, { id: true });
  if (!target) return res.status(404).json({ error: 'Document introuvable' });

  const { content, name, parent_id } = req.body;
  const data = { lastModifiedById: req.user.id };
  if (content !== undefined) data.content = content;
  if (name) data.name = name;

  if ('parent_id' in req.body) {
    if (parent_id === req.params.id) {
      return res.status(400).json({ error: 'Déplacement invalide' });
    }
    if (parent_id !== null) {
      const targetParent = await findAccessibleDoc(parent_id, req.user, { id: true });
      if (!targetParent) return res.status(400).json({ error: 'Dossier cible introuvable' });
      let cursor = parent_id;
      while (cursor) {
        if (cursor === req.params.id) {
          return res.status(400).json({ error: 'Déplacement invalide' });
        }
        const parent = await prisma.document.findFirst({
          where: { id: cursor, deletedAt: null },
          select: { parentId: true }
        });
        if (!parent) {
          return res.status(400).json({ error: 'Dossier cible introuvable' });
        }
        cursor = parent.parentId;
      }
    }
    data.parentId = parent_id;
  }

  const doc = await prisma.document.update({ where: { id: req.params.id }, data });
  res.json(doc);
});

router.delete('/:id', async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { createdById: true }
  });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  if (!isOwnerOrAdmin(doc, req.user)) return res.status(403).json({ error: 'Accès refusé' });
  await prisma.document.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() }
  });
  res.json({ success: true });
});

router.post('/:id/restore', async (req, res) => {
  const doc = await prisma.document.findUnique({
    where: { id: req.params.id },
    select: { createdById: true }
  });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  if (!isOwnerOrAdmin(doc, req.user)) return res.status(403).json({ error: 'Accès refusé' });
  await prisma.document.update({
    where: { id: req.params.id },
    data: { deletedAt: null }
  });
  res.json({ success: true });
});

router.post('/:id/upload', upload.single('file'), async (req, res) => {
  const target = await findAccessibleDoc(req.params.id, req.user, { id: true });
  if (!target) return res.status(404).json({ error: 'Document introuvable' });
  const { originalname, filename, mimetype } = req.file;
  await prisma.document.update({
    where: { id: req.params.id },
    data: { filePath: filename, fileName: originalname, mimeType: mimetype, lastModifiedById: req.user.id }
  });
  res.json({ success: true });
});

router.get('/:id/download', async (req, res) => {
  const doc = await findAccessibleDoc(req.params.id, req.user);
  if (!doc?.filePath) return res.status(404).json({ error: 'Aucun fichier' });
  res.download(path.join(__dirname, '../../uploads', doc.filePath), doc.fileName);
});

router.get('/:id/collaborators', async (req, res) => {
  const doc = await findAccessibleDoc(req.params.id, req.user, {
    id: true,
    createdBy: { select: { id: true, name: true, email: true } }
  });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  const perms = await prisma.documentPermission.findMany({
    where: { documentId: req.params.id },
    include: { user: { select: { id: true, name: true, email: true } } }
  });
  const invited = perms.map(p => p.user);
  const allUsers = invited.some(u => u.id === doc.createdBy.id)
    ? invited
    : [doc.createdBy, ...invited];
  res.json(allUsers);
});

router.post('/:id/invite', async (req, res) => {
  const { user_id } = req.body;
  const doc = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { createdById: true, parentId: true } });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  if (!isOwnerOrAdmin(doc, req.user)) return res.status(403).json({ error: 'Accès refusé' });

  const invitee = await prisma.user.findUnique({ where: { id: user_id }, select: { id: true } });
  if (!invitee) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const idsToGrant = [req.params.id];
  let parentId = doc.parentId;
  while (parentId) {
    const parent = await prisma.document.findFirst({ where: { id: parentId, deletedAt: null }, select: { parentId: true } });
    if (!parent) break;
    idsToGrant.push(parentId);
    parentId = parent.parentId;
  }

  await prisma.documentPermission.createMany({
    data: idsToGrant.map(docId => ({ documentId: docId, userId: user_id })),
    skipDuplicates: true
  });
  res.json({ success: true });
});

router.delete('/:id/collaborators/:userId', async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null }, select: { createdById: true } });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  if (!isOwnerOrAdmin(doc, req.user)) return res.status(403).json({ error: 'Accès refusé' });
  await prisma.documentPermission.deleteMany({
    where: { documentId: req.params.id, userId: req.params.userId }
  });
  res.json({ success: true });
});

router.get('/:id/messages', async (req, res) => {
  const doc = await findAccessibleDoc(req.params.id, req.user);
  if (!doc) return res.status(403).json({ error: 'Accès refusé' });

  const messages = await prisma.chatMessage.findMany({
    where: { documentId: req.params.id },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(messages);
});

router.post('/:id/messages', async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Message vide' });

  const doc = await findAccessibleDoc(req.params.id, req.user);
  if (!doc) return res.status(403).json({ error: 'Accès refusé' });

  const message = await prisma.chatMessage.create({
    data: { documentId: req.params.id, authorId: req.user.id, content: content.trim() },
    include: { author: { select: { id: true, name: true } } },
  });
  res.status(201).json(message);
});

export default router;
