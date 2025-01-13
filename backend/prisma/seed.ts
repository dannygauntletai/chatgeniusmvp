import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Create assistant bot user if it doesn't exist
  const assistantBotId = process.env.ASSISTANT_BOT_USER_ID!;
  const existingBot = await prisma.user.findUnique({
    where: { id: assistantBotId }
  });

  if (!existingBot) {
    await prisma.user.create({
      data: {
        id: assistantBotId,
        username: 'Assistant',
        email: 'assistant@chatgenius.ai',
        password: await hash('', 10), // Empty password hash
        avatarUrl: '/assistant-avatar.png'
      }
    });
  }

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
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 