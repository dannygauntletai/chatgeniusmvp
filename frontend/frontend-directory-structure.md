# Frontend File Structure

```plaintext
src/
├── services/              # API and data services
│   ├── api.ts            # Base API setup
│   ├── auth.service.ts   # Authentication
│   ├── channel.service.ts
│   ├── message.service.ts
│   ├── user.service.ts
│   └── socket.service.ts # Socket.io setup
│
├── hooks/                # React hooks
│   ├── useAuth.ts       # Auth state management
│   ├── useChannels.ts   # Channel state
│   ├── useMessages.ts   # Message state
│   ├── useUsers.ts      # User state
│   └── useSocket.ts     # Socket connection
│
├── features/
│   ├── auth/
│   │   ├── components/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── SignupForm.tsx
│   │   │   └── ForgotPassword.tsx
│   │   └── types/
│   │       └── auth.types.ts
│   │
│   ├── channels/
│   │   ├── components/
│   │   │   ├── ChannelList.tsx
│   │   │   ├── ChannelItem.tsx
│   │   │   ├── ChannelCreate.tsx
│   │   │   └── ChannelSettings.tsx
│   │   └── types/
│   │       └── channel.types.ts
│   │
│   ├── messages/
│   │   ├── components/
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageItem.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── MessageActions.tsx
│   │   │   └── ReactionPicker.tsx
│   │   └── types/
│   │       └── message.types.ts
│   │
│   ├── threads/
│   │   ├── components/
│   │   │   └── ThreadView.tsx
│   │   └── types/
│   │       └── thread.types.ts
│   │
│   ├── users/
│   │   ├── components/
│   │   │   ├── UserList.tsx
│   │   │   ├── UserProfile.tsx
│   │   │   └── UserStatus.tsx
│   │   └── types/
│   │       └── user.types.ts
│   │
│   └── shared/
│       ├── components/
│       │   ├── Avatar.tsx
│       │   ├── Modal.tsx
│       │   ├── ErrorBoundary.tsx
│       │   ├── LoadingSpinner.tsx
│       │   └── EmptyState.tsx
│       └── types/
│           └── shared.types.ts
│
├── context/             # Global state
│   ├── AuthContext.tsx
│   └── SocketContext.tsx
│
├── layouts/
│   └── MainLayout.tsx   # App layout wrapper
│
├── types/              # Global type definitions
│   ├── api.types.ts    # API responses/requests
│   └── socket.types.ts # Socket events
│
├── utils/             # Utility functions
│   ├── date.ts       # Date formatting
│   ├── storage.ts    # LocalStorage helpers
│   └── validation.ts # Form validation
│
├── constants/        # App constants
│   ├── api.ts       # API endpoints
│   └── config.ts    # App configuration
│
├── styles/          # Global styles
│   ├── globals.css     # Global styles and Tailwind imports
│   └── components/     # Custom component styles
│       └── custom.css  # Custom component-specific styles
│
├── App.tsx          # Main app component
├── index.tsx        # Entry point
└── vite-env.d.ts    # Vite type definitions

# Configuration files in root
├── .env
├── .env.development
├── .env.production
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js     # Tailwind configuration
└── postcss.config.js      # PostCSS configuration
```

## Directory Purposes

### `services/`
- Handle all API communications
- Manage Socket.io connections
- Process data before/after API calls

### `hooks/`
- Manage React state
- Handle side effects
- Connect services to components

### `features/`
- Feature-specific components
- Feature-specific types
- Shared components

### `context/`
- Global state management
- App-wide configurations
- Shared data providers

### `types/`
- Global TypeScript interfaces
- API type definitions
- Shared type utilities

### `utils/`
- Helper functions
- Formatting utilities
- Common operations

### `constants/`
- Configuration values
- API endpoints
- Static data

### `styles/`
- Tailwind configuration
- Global CSS
- Component-specific styles

### Root Files
- App initialization
- Environment configuration
- Build settings
- Tailwind and PostCSS setup