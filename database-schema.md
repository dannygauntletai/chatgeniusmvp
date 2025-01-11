# Database Schema Documentation

## Tables

### profiles
| Column           | Type        | Description                    |
|-----------------|-------------|--------------------------------|
| id              | UUID        | Primary key, links to auth.users |
| username        | TEXT        | Unique username                |
| avatar_url      | TEXT        | URL to user's avatar image    |
| is_online       | BOOLEAN     | Whether user is currently online |
| status          | TEXT        | User's custom status message  |
| updated_at      | TIMESTAMPTZ | Last update timestamp         |
| currently_typing| BOOLEAN     | Whether user is typing        |

### channels
| Column      | Type      | Description                    |
|-------------|-----------|--------------------------------|
| id          | UUID      | Primary key                    |
| name        | TEXT      | Unique channel name            |
| description | TEXT      | Channel description            |
| is_public   | BOOLEAN   | Public/private flag            |
| created_at  | TIMESTAMP | Creation timestamp             |
| created_by  | UUID      | FK to profiles.id              |

### messages
| Column           | Type      | Description                    |
|-----------------|-----------|--------------------------------|
| id              | UUID      | Primary key                    |
| content         | TEXT      | Message content                |
| sender_id       | UUID      | FK to profiles.id              |
| channel_id      | UUID      | FK to channels.id (for channel messages) |
| recipient_id    | UUID      | FK to profiles.id (for DMs)    |
| parent_message_id| UUID     | FK to messages.id (for threads)|
| created_at      | TIMESTAMP | Creation timestamp             |
| emojis          | JSONB     | Emoji reactions data           |

## Notes
- All timestamps are in UTC
- Profile is automatically created when a user signs up
- Users can only update their own profile
- `is_online` is automatically set to true on sign in and false on sign out
- `status` is optional and defaults to null
- Channel names must be unique
- Messages can be either in a channel (`channel_id`) or a DM (`recipient_id`), but not both
- Threading is supported via `parent_message_id`
- Emoji reactions are stored in JSONB format in the messages table
- `currently_typing` is used for real-time typing indicators

## Relationships

### One-to-Many
- profiles → messages (sender)
- profiles → channels (creator)
- channels → messages (container)
- messages → messages (parent-child for threads)

## Authentication
The `profiles` table is linked to the authentication system via `auth.users.id`. This provides a secure way to manage user authentication separately from user data.

## Data Types
- UUID: Universally Unique Identifier
- TEXT: Variable-length character strings
- BOOLEAN: True/false values
- TIMESTAMP: Date and time (UTC)
- TIMESTAMPTZ: Date and time with timezone
- JSONB: Binary JSON data (used for emoji reactions)

## Emoji Reactions Structure
The `emojis` JSONB field in the messages table follows this structure:
```json
{
  "heart": [],
  "smile": [],
  "thumbsup": []
}
```

Each array contains nested arrays of the form `[id, username]` where:
- `id`: UUID that maps to the primary key of the profiles table
- `username`: User's username

Example:
```json
{
  "heart": [
    ["123e4567-e89b-12d3-a456-426614174000", "johndoe"],
    ["987fcdeb-51a2-43f7-9abc-123456789012", "janesmith"]
  ],
  "smile": [
    ["123e4567-e89b-12d3-a456-426614174000", "johndoe"]
  ],
  "thumbsup": []
}
```