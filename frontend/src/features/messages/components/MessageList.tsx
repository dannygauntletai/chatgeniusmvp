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
import { UserService } from '../../../services/user.service';
import { useUserContext } from '../../../contexts/UserContext';

const ChannelHeader = ({ name }: { name: string }) => {
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const { username: currentUsername } = useUserContext();
  const [otherUsername, setOtherUsername] = useState<string>('');
  const [otherUserId, setOtherUserId] = useState<string>('');

  useEffect(() => {
    const fetchUserStatus = async () => {
      if (name.startsWith('dm-')) {
        const usernames = name.substring(3).split('-');
        const otherUser = usernames.find(u => u !== currentUsername) || '';
        setOtherUsername(otherUser);

        try {
          const users = await UserService.getUsers();
          const user = users.find(u => u.username === otherUser);
          if (user) {
            setOtherUserId(user.id);
            setUserStatus(user.user_status || '😊');
          }
        } catch (error) {
          console.error('Failed to fetch user status:', error);
        }
      }
    };

    fetchUserStatus();
  }, [name, currentUsername]);

  useEffect(() => {
    if (!otherUserId) return;

    const handleStatusUpdate = (data: { userId: string; status: string }) => {
      if (data.userId === otherUserId) {
        setUserStatus(data.status);
      }
    };

    socket.on('user:status_updated', handleStatusUpdate);

    return () => {
      socket.off('user:status_updated', handleStatusUpdate);
    };
  }, [otherUserId]);

  const displayName = name.startsWith('dm-') 
    ? `@${otherUsername}`
    : name.startsWith('#') ? name : `#${name}`;

  return (
    <div className="h-12 flex items-center px-6 border-b border-gray-600 bg-gray-800">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-medium text-white">
          {displayName}
        </h2>
        {name.startsWith('dm-') && userStatus && (
          <>
            <span className="text-gray-300">-</span>
            <span>{userStatus}</span>
          </>
        )}
      </div>
    </div>
  );
};

const MessageListContent = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { activeChannel } = useChannel();
  const { activeThreadId, activeThreadMessage, isThreadOpen, closeThread } = useThread();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Scroll to bottom on initial load and channel change
  useEffect(() => {
    if (messages.length > 0 && !loading) {
      scrollToBottom();
    }
  }, [loading, activeChannel?.id]);

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
        // Use smooth scrolling for new messages
        scrollToBottom('smooth');
      }
    };

    socket.on('message:created', handleNewMessage);
    return () => {
      socket.off('message:created', handleNewMessage);
    };
  }, [activeChannel?.id]);

  if (!activeChannel) return <EmptyState message="Select a channel to start chatting" />;

  return (
    <div className="h-full flex">
      <div className="flex-1 relative">
        <ChannelHeader name={activeChannel.name} />
        <div 
          ref={messageListRef}
          className="absolute inset-0 top-12 overflow-y-auto bg-gray-800"
        >
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-red-500">{error}</div>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <EmptyState message="No messages yet" />
            </div>
          ) : (
            <div className="min-h-full flex flex-col justify-end">
              {messages.map(message => (
                <MessageItem key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>
      {isThreadOpen && activeThreadMessage && (
        <div className="w-96 border-l border-gray-700 shadow-xl bg-gray-800">
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