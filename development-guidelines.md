# Development Guidelines

## Architecture Patterns

### 1. Frontend Architecture
- **Feature-First Organization**
  - Each feature (messages, channels, etc.) is self-contained
  - Shared components live in features/shared
  - Feature-specific types stay with features

- **Container/Presenter Pattern**
  ```typescript
  // Container (Smart Component)
  const MessageListContainer = () => {
    const messages = useMessages(channelId);
    return <MessageList messages={messages} />;
  };

  // Presenter (Dumb Component)
  const MessageList: FC<MessageListProps> = ({ messages }) => {
    return <div>{/* render messages */}</div>;
  };
  ```

- **Custom Hook Pattern**
  ```typescript
  // Separate business logic from UI
  const useMessages = (channelId: string) => {
    const socket = useSocket();
    const [messages, setMessages] = useState<Message[]>([]);
    // ... socket logic, message handling
    return { messages, sendMessage, isLoading };
  };
  ```

### 2. Backend Architecture
- **Service Layer Pattern**
  - Controllers handle HTTP/Socket requests
  - Services contain business logic
  - Prisma handles data access

- **Event-Driven Architecture** (Socket.io)
  - Centralized event handlers
  - Event emitters in services
  - Type-safe event definitions

## Coding Standards

### 1. TypeScript Standards
```typescript
// Use explicit typing
type MessageProps = {
  id: string;
  content: string;
  sender: User;
};

// Use enums for constants
enum MessageType {
  CHANNEL = 'channel',
  DIRECT = 'direct',
  THREAD = 'thread'
}

// Use interfaces for extendable types
interface BaseMessage {
  id: string;
  content: string;
}

interface ThreadMessage extends BaseMessage {
  parentId: string;
}
```

### 2. React Standards
- Use functional components with hooks
- Implement error boundaries at feature level
- Maintain consistent prop naming conventions
- Use TypeScript generics for reusable components

### 3. Express Standards
- Use async/await with proper error handling
- Implement middleware for common operations
- Type-safe request/response objects
- Centralized error handling

## SOLID Principles

### 1. Single Responsibility
```typescript
// Good
class MessageService {
  async send(message: MessageCreateInput): Promise<Message> {
    // Only handles message creation
  }
}

class MessageNotificationService {
  async notify(messageId: string): Promise<void> {
    // Only handles notifications
  }
}

// Bad
class MessageHandler {
  async handleMessage(message: MessageCreateInput) {
    // Handles creation, notification, logging, etc.
  }
}
```

### 2. Open/Closed
```typescript
// Good
interface MessageFormatter {
  format(message: Message): string;
}

class PlainTextFormatter implements MessageFormatter {
  format(message: Message): string {
    return message.content;
  }
}

class MarkdownFormatter implements MessageFormatter {
  format(message: Message): string {
    return marked(message.content);
  }
}
```

### 3. Dependency Inversion
```typescript
// Good
interface MessageRepository {
  find(id: string): Promise<Message>;
}

class MessageService {
  constructor(private repository: MessageRepository) {}
}

// Instead of direct Prisma dependency
class PrismaMessageRepository implements MessageRepository {
  constructor(private prisma: PrismaClient) {}
}
```

## Refactoring Guidelines

### 1. When to Refactor
- Duplicated code across features
- Complex conditional logic
- Large components (>250 lines)
- Unclear component responsibilities
- Type-safety issues

### 2. Refactoring Strategies
- Extract shared logic into hooks
- Split large components
- Move business logic to services
- Create type utilities for common patterns
- Implement proper error boundaries

## Quality Assurance

### 1. Testing Strategy
```typescript
// Component Tests
describe('MessageList', () => {
  it('renders messages in correct order', () => {
    // Component-specific tests
  });
});

// Hook Tests
describe('useMessages', () => {
  it('handles real-time updates', () => {
    // Hook-specific tests
  });
});

// Service Tests
describe('MessageService', () => {
  it('creates messages with correct structure', () => {
    // Service-specific tests
  });
});
```

### 2. Type Safety
- Use strict TypeScript configuration
- Implement proper type guards
- Validate API responses
- Type-safe event handling

## Technical Approach

### 1. State Management
- Context for global state (auth, socket)
- Local state for component-specific data
- Custom hooks for shared logic
- Type-safe actions and reducers

### 2. Real-time Updates
```typescript
// Socket Event Handling
interface ServerToClientEvents {
  messageCreated: (message: Message) => void;
  userTyping: (data: TypingIndicator) => void;
}

interface ClientToServerEvents {
  sendMessage: (message: MessageCreateInput) => void;
  startTyping: (channelId: string) => void;
}
```

### 3. Performance Optimization
- Virtual scrolling for message lists
- Efficient socket event handling
- Debounced input handlers
- Memoized components
- Optimistic updates
- Proper error boundaries

### 4. Error Handling
```typescript
// Global Error Handler
const errorHandler = (error: unknown): ApiError => {
  if (error instanceof PrismaError) {
    return new ApiError('Database Error', 500);
  }
  // ... handle other error types
};

// Component Error Boundary
class FeatureErrorBoundary extends React.Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
}
```

## Development Flow

1. **Feature Development**
   - Create types/interfaces
   - Implement services
   - Create hooks
   - Build components
   - Add tests

2. **Code Review Process**
   - Type safety check
   - Component structure review
   - Performance review
   - Test coverage check

3. **Documentation**
   - Component documentation
   - API documentation
   - Type definitions
   - Usage examples