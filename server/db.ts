import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

let PrismaClient: any;
try {
    const prismaModule = await import("@prisma/client");
    PrismaClient = prismaModule.PrismaClient;
} catch (e) {
    console.warn("PrismaClient not found in @prisma/client, using fallback.");
    PrismaClient = class {
        constructor() {
            console.error("PrismaClient is a dummy. Only raw SQL is supported.");
        }
        $queryRawUnsafe() { throw new Error("PrismaClient is missing. Use raw pg pool instead if needed."); }
        $executeRawUnsafe() { throw new Error("PrismaClient is missing. Use raw pg pool instead if needed."); }
    };
}

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new pg.Pool({ connectionString });

let prisma: any;
try {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
} catch (e) {
    prisma = new PrismaClient();
}

export { pool };
export default prisma;
