import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'guest@staywise.com';
  const password = await bcrypt.hash('123456', 10);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password,
      name: '演示用户',
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
