import React, { useState } from 'react';
import { MessageService } from '../../../services/message.service';
import { useChannel } from '../../channels/context/ChannelContext';
import { useUserContext } from '../../../contexts/UserContext';
import { socket } from '../../../services/socket.service';
import { Message } from '../types/message.types';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSending) return;

    const trimmedContent = content.trim();
    setIsSending(true);
    setContent('');

    // Create optimistic message
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      content: trimmedContent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId,
      channelId: activeChannel?.id || '',
      threadId: threadParentId,
      user: {
        id: userId,
        username
      },
      reactions: {}
    };

    // Update UI immediately
    onOptimisticUpdate?.(optimisticMessage);

    try {
      if (onSend) {
        await onSend(trimmedContent);
      } else if (threadParentId) {
        await MessageService.createMessage({
          content: trimmedContent,
          threadId: threadParentId,
        });
      } else if (activeChannel) {
        await MessageService.createMessage({
          content: trimmedContent,
          channelId: activeChannel.id,
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // Revert optimistic update
      onOptimisticRevert?.(optimisticMessage.id);
      setContent(trimmedContent);
    } finally {
      setIsSending(false);
    }
  };

  if (!activeChannel && !onSend && !threadParentId) return null;

  return (
    <div className="border-t border-gray-600">
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:border-primary bg-gray-900 text-white"
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