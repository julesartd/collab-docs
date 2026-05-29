import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const adminEmail = process.env.ADMIN_EMAIL || 'admin@collab-docs.fr';
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';


const adminHash = await bcrypt.hash(adminPassword, 10);
const superAdmin = await prisma.user.upsert({
  where: { email: adminEmail },
  update: { passwordHash: adminHash },
  create: { email: adminEmail, name: 'Admin', passwordHash: adminHash, role: 'SUPERADMIN' }
});
console.log(`Superadmin créé : ${adminEmail} / ${adminPassword}`);


const testUser = await prisma.user.upsert({
  where: { email: 'user@collab-docs.fr' },
  update: {},
  create: { email: 'user@collab-docs.fr', name: 'Utilisateur Test', passwordHash: await bcrypt.hash('user123', 10), role: 'USER' }
});
console.log(`User test créé : user@collab-docs.fr / user123`);

const testUser2 = await prisma.user.upsert({
  where: { email: 'user2@collab-docs.fr' },
  update: {},
  create: { email: 'user2@collab-docs.fr', name: 'Utilisateur Test 2', passwordHash: await bcrypt.hash('user123', 10), role: 'USER' }
});
console.log(`User test 2 créé : user2@collab-docs.fr / user123`);

const doc = await prisma.document.upsert({
  where: { id: 'aaaaaaaa-0000-0000-0000-000000000001' },
  update: {},
  create: {
    id: 'aaaaaaaa-0000-0000-0000-000000000001',
    name: 'Document de test',
    type: 'TEXT',
    content: 'Bienvenue sur Collab Docs ! Modifiez ce texte pour tester l\'édition collaborative et la CallBar.',
    createdById: superAdmin.id,
    lastModifiedById: superAdmin.id,
  }
});
console.log('Document de test créé');

await prisma.documentPermission.upsert({
  where: { documentId_userId: { documentId: doc.id, userId: testUser.id } },
  update: {},
  create: { documentId: doc.id, userId: testUser.id }
});
console.log('Utilisateur test invité sur le document');

await prisma.documentPermission.upsert({
  where: { documentId_userId: { documentId: doc.id, userId: testUser2.id } },
  update: {},
  create: { documentId: doc.id, userId: testUser2.id }
});
console.log('Utilisateur test 2 invité sur le document');

await prisma.$disconnect();
