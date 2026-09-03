import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './src/generated/prisma/client.ts';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const f = await prisma.failleJuridique.findMany({ where: { statut: 'PROPOSEE' }, select: { id: true } });
console.log('PROPOSEE', f.length, f.map(x=>x.id).join(', '));
const a = await prisma.failleJuridique.findMany({ where: { statut: 'ACTIVE' }, select: { id: true } });
console.log('ACTIVE', a.length);
await prisma.$disconnect();
