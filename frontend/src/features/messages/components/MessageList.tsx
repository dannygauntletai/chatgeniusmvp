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
import { UserInviteModal } from '../../users/components/UserInviteModal';
import { ChannelMembersModal } from '../../channels/components/ChannelMembersModal';
import { MessageInput } from './MessageInput';

const ChannelHeader = ({ name, isPrivate, channelId }: { name: string; isPrivate: boolean; channelId: string }) => {
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const { username: currentUsername } = useUserContext();
  const [otherUsername, setOtherUsername] = useState<string>('');
  const [otherUserId, setOtherUserId] = useState<string>('');
  const { activeChannel } = useChannel();

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
    <>
      <div className="h-12 flex items-center justify-between px-6 border-b border-gray-600 bg-gray-800">
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
        <div className="flex items-center gap-2">
          {isPrivate && !name.startsWith('dm-') && (
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Invite
            </button>
          )}
          {!name.startsWith('dm-') && (
            <button
              onClick={() => setIsMembersModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-white bg-gray-700 hover:bg-gray-600 rounded transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12a4 4 0 100-8 4 4 0 000 8z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              </svg>
              Members
            </button>
          )}
        </div>
      </div>
      <UserInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        channelId={channelId}
      />
      {activeChannel && (
        <ChannelMembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          channel={activeChannel}
        />
      )}
    </>
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
  }, [loading, activeChannel?.id, messages.length]);

  const handleOptimisticUpdate = (message: Message) => {
    setMessages(prev => [...prev, message]);
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  const handleOptimisticRevert = (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  };

  useEffect(() => {
    if (!activeChannel) {
      setMessages([]);
      return;
    }

    let mounted = true;
    setLoading(true);

    // Join channel room and wait for connection
    const joinChannel = () => {
      return new Promise<void>((resolve) => {
        socket.emit('channel:join', activeChannel.id);
        // Wait a brief moment to ensure we're connected
        setTimeout(resolve, 100);
      });
    };

    // Load messages after joining channel
    const loadMessages = async () => {
      try {
        await joinChannel();
        if (!mounted) return;

        const data = await MessageService.getChannelMessages(activeChannel.id);
        if (!mounted) return;

        setMessages(data.filter(message => !message.threadId));
        setError(null);
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      } catch (err) {
        if (mounted) {
          setError('Failed to load messages');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadMessages();

    const handleNewMessage = (message: Message) => {
      if (message.channelId === activeChannel.id && !message.threadId) {
        setMessages(prev => {
          const tempMessageIndex = prev.findIndex(m => 
            m.id.startsWith('temp-') && m.content === message.content
          );
          
          if (tempMessageIndex === -1) {
            return [...prev, message];
          }
          
          const newMessages = [...prev];
          const tempMessage = newMessages[tempMessageIndex];
          
          // Preserve assistant user information
          if (tempMessage.userId === 'assistant') {
            newMessages[tempMessageIndex] = {
              ...message,
              userId: 'assistant',
              user: {
                id: 'assistant',
                username: 'Assistant'
              }
            };
          } else {
            newMessages[tempMessageIndex] = message;
          }
          
          return newMessages;
        });
        
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    };

    socket.on('message:created', handleNewMessage);

    return () => {
      mounted = false;
      socket.off('message:created', handleNewMessage);
      socket.emit('channel:leave', activeChannel.id);
    };
  }, [activeChannel?.id]);

  if (!activeChannel) return <EmptyState message="Select a channel to start chatting" />;

  return (
    <div className="h-full flex">
      <div className="flex-1 relative">
        <ChannelHeader 
          name={activeChannel.name} 
          isPrivate={activeChannel.isPrivate}
          channelId={activeChannel.id}
        />
        <div 
          ref={messageListRef}
          className="absolute inset-0 top-12 bottom-[72px] overflow-y-auto bg-gray-800"
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
        <div className="absolute bottom-0 left-0 right-0">
          <MessageInput 
            onOptimisticUpdate={handleOptimisticUpdate}
            onOptimisticRevert={handleOptimisticRevert}
          />
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