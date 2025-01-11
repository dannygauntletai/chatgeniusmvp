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
  const { activeChannel } = useChannel();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    try {
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
    }
  };

  if (!activeChannel && !onSend && !threadParentId) return null;

  return (
    <div className="border-t">
      <form onSubmit={handleSubmit} className="p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!content.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}; 