# Prisma Schema

## Configuration

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Profile {
  id               String    @id @default(uuid()) @db.Uuid
  username         String    @unique
  avatarUrl        String?   @map("avatar_url")
  isOnline         Boolean   @default(false) @map("is_online")
  status           String?
  updatedAt        DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  currentlyTyping  Boolean   @default(false) @map("currently_typing")

  // Relations
  sentMessages     Message[] @relation("SenderMessages")
  createdChannels  Channel[] @relation("ChannelCreator")
  receivedMessages Message[] @relation("RecipientMessages")

  @@map("profiles")
}

model Channel {
  id           String   @id @default(uuid()) @db.Uuid
  name         String   @unique
  description  String?
  isPublic     Boolean  @default(true) @map("is_public")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamp
  createdById  String   @map("created_by") @db.Uuid
  
  // Relations
  creator      Profile  @relation("ChannelCreator", fields: [createdById], references: [id])
  messages     Message[]

  @@map("channels")
}

model Message {
  id              String    @id @default(uuid()) @db.Uuid
  content         String
  senderId        String    @map("sender_id") @db.Uuid
  channelId       String?   @map("channel_id") @db.Uuid
  recipientId     String?   @map("recipient_id") @db.Uuid
  parentMessageId String?   @map("parent_message_id") @db.Uuid
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamp
  emojis          Json      @default("{}") @db.JsonB

  // Relations
  sender          Profile   @relation("SenderMessages", fields: [senderId], references: [id])
  channel         Channel?  @relation(fields: [channelId], references: [id])
  recipient       Profile?  @relation("RecipientMessages", fields: [recipientId], references: [id])
  parentMessage   Message?  @relation("ThreadMessages", fields: [parentMessageId], references: [id])
  replies         Message[] @relation("ThreadMessages")

  @@map("messages")
}
```

## Type Definitions for Type Safety

```typescript
// types/prisma.d.ts

// Type for the emojis JSON structure matching the database schema exactly
type EmojiReactions = {
  [key: string]: Array<[string, string]>; // Array of [id, username]
};

// Input types matching the database schema
export type ProfileCreateInput = {
  username: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
  status?: string | null;
  currentlyTyping?: boolean;
};

export type ChannelCreateInput = {
  name: string;
  description?: string | null;
  isPublic?: boolean;
  createdById: string;
};

export type MessageCreateInput = {
  content: string;
  senderId: string;
  channelId?: string | null;
  recipientId?: string | null;
  parentMessageId?: string | null;
  emojis?: EmojiReactions;
};
```

## Notes
- The schema exactly matches the database structure provided
- Emoji reactions are stored as arrays of [id, username] pairs
- All timestamps and types match the original specification
- Relations match the documented one-to-many relationships
- No additional constraints or behaviors have been added

## Example Safe Emoji Operation

```typescript
const addReaction = async (
  messageId: string,
  emoji: string,
  userId: string,
  username: string
) => {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { emojis: true },
  });

  if (!message) throw new Error('Message not found');

  const currentEmojis = message.emojis as EmojiReactions;
  const reactions = currentEmojis[emoji] || [];
  
  // Add reaction if not already present
  if (!reactions.some(([id]) => id === userId)) {
    reactions.push([userId, username]);
  }

  return await prisma.message.update({
    where: { id: messageId },
    data: {
      emojis: {
        ...currentEmojis,
        [emoji]: reactions,
      },
    },
  });
};
```