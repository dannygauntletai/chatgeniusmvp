import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create test user
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      id: 'test-user-id', // Match the hardcoded ID in auth middleware
      email: 'test@example.com',
      username: 'testuser',
      password: 'password',
    },
  });

  // Create test channel
  const channel = await prisma.channel.upsert({
    where: { id: 'test-channel' },
    update: {},
    create: {
      id: 'test-channel',
      name: 'Test Channel',
      ownerId: user.id,
      members: {
        connect: { id: user.id }
      }
    },
  });

  console.log({ user, channel });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect()); 