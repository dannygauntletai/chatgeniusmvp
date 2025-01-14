import React, { useState } from 'react';
import { MessageService } from '../../../services/message.service';
import { AssistantService } from '../../../services/assistant.service';
import { useChannel } from '../../channels/context/ChannelContext';
import { useUserContext } from '../../../contexts/UserContext';
import { socket } from '../../../services/socket.service';
import { Message } from '../types/message.types';

// Get assistant bot ID from environment variable
const ASSISTANT_BOT_USER_ID = import.meta.env.VITE_ASSISTANT_BOT_USER_ID || 'assistant';

interface MessageInputProps {
  onSend?: (content: string) => Promise<void>;
  placeholder?: string;
  threadParentId?: string;
  onOptimisticUpdate?: (message: Message) => void;
  onOptimisticRevert?: (messageId: string) => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({ 
  onSend,
  placeholder = "Type a message...",
  threadParentId,
  onOptimisticUpdate,
  onOptimisticRevert
}) => {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { activeChannel } = useChannel();
  const { userId, username } = useUserContext();

  const handleAssistantMention = async (type: string, query: string) => {
    if (type === 'assistant' && activeChannel && userId) {
      try {
        const response = await AssistantService.getResponse(
          query,
          activeChannel.id,
          userId,
          activeChannel.isPrivate ? 'private' : 'public',
          threadParentId
        );
        
        // Create optimistic message for assistant's response
        const optimisticMessage: Message = {
          id: `temp-${Date.now()}`,
          content: response.response,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          userId: ASSISTANT_BOT_USER_ID,
          channelId: activeChannel.id,
          threadId: threadParentId,
          user: {
            id: ASSISTANT_BOT_USER_ID,
            username: 'Assistant'
          },
          reactions: {}
        };

        // Update UI immediately
        onOptimisticUpdate?.(optimisticMessage);
        
        try {
          // Send the actual message
          if (threadParentId) {
            await MessageService.createMessage({
              content: response.response,
              threadId: threadParentId,
            });
          } else {
            await MessageService.createMessage({
              content: response.response,
              channelId: activeChannel.id,
            });
          }
        } catch (error) {
          console.error('Failed to send assistant message:', error);
          // Revert optimistic update if message send fails
          onOptimisticRevert?.(optimisticMessage.id);
        }
      } catch (error) {
        console.error('Failed to get assistant response:', error);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSending || !activeChannel || !userId || !username) return;

    const trimmedContent = content.trim();
    setIsSending(true);
    setContent('');

    // Create optimistic message for user's message
    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      content: trimmedContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: userId as string,
      channelId: activeChannel.id,
      threadId: threadParentId || undefined,
      user: {
        id: userId as string,
        username: username as string
      },
      reactions: {}
    };

    // Update UI with user's message
    onOptimisticUpdate?.(userMessage);

    try {
      // Send user's message
      if (onSend) {
        await onSend(trimmedContent);
      } else if (threadParentId) {
        await MessageService.createMessage({
          content: trimmedContent,
          threadId: threadParentId,
        });
      } else {
        await MessageService.createMessage({
          content: trimmedContent,
          channelId: activeChannel.id,
        });
      }

      // If this is a DM with the assistant or contains @assistant mention, get the assistant's response
      const isDMWithAssistant = activeChannel.isPrivate && activeChannel.members?.some(member => member.id === ASSISTANT_BOT_USER_ID);
      if (isDMWithAssistant || trimmedContent.includes('@assistant')) {
        const query = trimmedContent.replace(/@assistant/g, '').trim();
        await handleAssistantMention('assistant', query);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Revert optimistic update
      onOptimisticRevert?.(userMessage.id);
      setContent(trimmedContent);
    } finally {
      setIsSending(false);
    }
  };

  if (!activeChannel && !onSend && !threadParentId) return null;

  return (
    <div className="bg-gray-800 border-t border-gray-600">
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:border-white text-white"
            disabled={isSending}
          />
          <button
            type="submit"
            disabled={!content.trim() || isSending}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}; 