import { useState } from 'react';
import { MessageService } from '../../../services/message.service';
import { useChannel } from '../../channels/context/ChannelContext';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSending) return;

    try {
      setIsSending(true);
      if (onSend) {
        await onSend(content.trim());
      } else if (threadParentId) {
        await MessageService.createMessage({
          content: content.trim(),
          threadId: threadParentId,
        });
      } else if (activeChannel) {
        await MessageService.createMessage({
          content: content.trim(),
          channelId: activeChannel.id,
        });
      }
      setContent('');
    } catch (error) {
      console.error('Failed to send message:', error);
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
            disabled={!content.trim()}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}; 