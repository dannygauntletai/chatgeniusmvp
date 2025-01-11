# Backend File Structure

```plaintext
src/
├── config/                 # Configuration files
│   ├── database.ts        # Database configuration
│   ├── socket.ts          # Socket.io setup
│   └── auth.ts            # Authentication config (JWT)
│
├── prisma/                # Prisma configuration and schemas
│   ├── schema.prisma      # Database schema
│   ├── migrations/        # Database migrations
│   └── seed.ts           # Seed data
│
├── controllers/           # Route handlers
│   ├── auth.controller.ts
│   ├── channel.controller.ts
│   ├── message.controller.ts
│   ├── thread.controller.ts
│   └── user.controller.ts
│
├── services/             # Business logic
│   ├── auth.service.ts
│   ├── channel.service.ts
│   ├── message.service.ts
│   ├── thread.service.ts
│   └── user.service.ts
│
├── routes/              # Express routes
│   ├── auth.routes.ts
│   ├── channel.routes.ts
│   ├── message.routes.ts
│   ├── thread.routes.ts
│   └── user.routes.ts
│
├── middleware/          # Express middleware
│   ├── auth.middleware.ts    # JWT verification
│   ├── error.middleware.ts   # Error handling
│   ├── validate.middleware.ts # Request validation
│   └── upload.middleware.ts  # File upload handling
│
├── utils/              # Utility functions
│   ├── logger.ts      # Logging utility
│   ├── errors.ts      # Custom error classes
│   └── validators.ts  # Data validation
│
├── types/             # TypeScript types
│   ├── express.d.ts   # Express type extensions
│   ├── socket.d.ts    # Socket type definitions
│   └── models.d.ts    # Shared type definitions
│
├── socket/            # Socket.io event handlers
│   ├── connection.ts  # Connection handling
│   ├── message.ts     # Message events
│   ├── typing.ts      # Typing indicators
│   └── presence.ts    # User presence
│
└── app.ts            # Express app setup

# Configuration files in root
├── .env
├── .env.development
├── .env.test
├── .env.production
├── package.json
├── tsconfig.json
└── jest.config.js
```

## Directory Purposes

### `prisma/`
- Database schema definition
- Migration management
- Seeding scripts

### `controllers/`
- HTTP request handling
- Request/Response processing
- Route-specific logic

### `services/`
- Business logic implementation
- Database operations
- External service integration

### `routes/`
- API endpoint definitions
- Route grouping
- Middleware application

### `middleware/`
- Request processing
- Authentication
- Error handling
- Request validation

### `socket/`
- Real-time event handling
- WebSocket connections
- Presence management

### `utils/`
- Helper functions
- Error classes
- Validation utilities

### `types/`
- TypeScript definitions
- Type extensions
- Shared interfaces

## Key Files

### `prisma/schema.prisma`
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  username  String   @unique
  password  String
  status    String   @default("offline")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  messages    Message[]
  channels    Channel[]    @relation("ChannelMembers")
  ownedChannels Channel[]  @relation("ChannelOwner")
}

model Channel {
  id          String   @id @default(uuid())
  name        String
  isPrivate   Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  ownerId     String
  owner       User     @relation("ChannelOwner", fields: [ownerId], references: [id])
  members     User[]   @relation("ChannelMembers")
  messages    Message[]
}

model Message {
  id        String   @id @default(uuid())
  content   String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  channelId String
  channel   Channel  @relation(fields: [channelId], references: [id])
  threadId  String?
  thread    Message? @relation("ThreadMessages", fields: [threadId], references: [id])
  replies   Message[] @relation("ThreadMessages")
}
```