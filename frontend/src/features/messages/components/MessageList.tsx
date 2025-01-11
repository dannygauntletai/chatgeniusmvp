import { useEffect, useState, useRef } from 'react';
import { Message } from '../types/message.types';
import { MessageService } from '../../../services/message.service';
import { socket } from '../../../services/socket.service';
import { useChannel } from '../../channels/context/ChannelContext';
import { LoadingSpinner } from '../../shared/components/LoadingSpinner';
import { EmptyState } from '../../shared/components/EmptyState';
import { MessageItem } from './MessageItem';
import { ThreadProvider } from '../../threads/context';
import { ThreadView } from '../../threads/components/ThreadView';
import { useThread } from '../../threads/context';

const MessageListContent = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeChannel } = useChannel();
  const { activeThreadId, activeThreadMessage, isThreadOpen, closeThread } = useThread();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, activeChannel?.id]);

  useEffect(() => {
    if (!activeChannel) {
      setMessages([]);
      return;
    }

    setLoading(true);
    MessageService.getChannelMessages(activeChannel.id)
      .then(data => {
        setMessages(data.filter(message => !message.threadId));
        setError(null);
      })
      .catch(() => setError('Failed to load messages'))
      .finally(() => setLoading(false));

    const handleNewMessage = (message: Message) => {
      if (message.channelId === activeChannel.id && !message.threadId) {
        setMessages(prev => [...prev, message]);
      }
    };

    socket.on('message:created', handleNewMessage);
    return () => {
      socket.off('message:created', handleNewMessage);
    };
  }, [activeChannel?.id]);

  if (!activeChannel) return <EmptyState message="Select a channel to start chatting" />;
  if (loading) return <LoadingSpinner />;
  if (error) return <div className="p-4 text-red-500">{error}</div>;
  if (messages.length === 0) return <EmptyState message="No messages yet" />;

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
        {messages.map(message => (
          <MessageItem key={message.id} message={message} />
        ))}
      </div>
      {isThreadOpen && activeThreadMessage && (
        <div className="w-96 border-l shadow-xl bg-white">
          <ThreadView
            parentMessageId={activeThreadId!}
            onClose={closeThread}
            parentMessage={activeThreadMessage}
          />
        </div>
      )}
    </div>
  );
};

export const MessageList = () => {
  return (
    <ThreadProvider>
      <MessageListContent />
    </ThreadProvider>
  );
}; 