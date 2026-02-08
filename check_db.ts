import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = `${process.env.DATABASE_URL}`;

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function check() {
  const user = await prisma.user.findUnique({ where: { email: 'c.perezb@yahoo.com' } });
  console.log('--- DB CHECK ---');
  console.log('Email:', user?.email);
  console.log('isApproved:', user?.isApproved);
  console.log('--- Full User Object ---');
  console.log(user);
  console.log('----------------');
  await prisma.$disconnect();
  await pool.end();
}

check();
