import pg from "pg";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "@prisma/client";

const { PrismaClient } = pkg;

dotenv.config();

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export { pool };
export default prisma;

