import React, { useState } from 'react';
import { MessageService } from '../../../services/message.service';
import { useChannel } from '../../channels/context/ChannelContext';
import { useUserContext } from '../../../contexts/UserContext';
import { socket } from '../../../services/socket.service';

interface MessageInputProps {
  onSend?: (content: string) => Promise<void>;
  placeholder?: string;
  threadParentId?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({ 
  onSend,
  placeholder = "Type a message...",
  threadParentId
}) => {
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const { activeChannel } = useChannel();
  const { userId, username } = useUserContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSending || !activeChannel || !userId || !username) return;

    const trimmedContent = content.trim();
    setIsSending(true);
    setContent('');

    try {
      // Send user's message
      if (onSend) {
        await onSend(trimmedContent);
      } else if (threadParentId) {
        await MessageService.createMessage({
          content: trimmedContent,
          threadId: threadParentId,
          channelId: activeChannel.id
        });
      } else {
        await MessageService.createMessage({
          content: trimmedContent,
          channelId: activeChannel.id,
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
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