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

// Socket event types
interface ChannelJoinedEvent {
  channelId: string;
}

interface ChannelLeftEvent {
  channelId: string;
}

interface ChannelErrorEvent {
  error: string;
}

const ChannelHeader = ({ name, isPrivate, channelId }: { name: string; isPrivate: boolean; channelId: string }) => {
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [userEmoji, setUserEmoji] = useState<string>('😊');
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
            if (user.id === import.meta.env.VITE_ASSISTANT_BOT_USER_ID) {
              setUserStatus('online');
              setUserEmoji('🤖');
            } else {
              setUserStatus(user.status || 'offline');
              setUserEmoji(user.user_status || '😊');
            }
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

    const handleStatusUpdate = (data: { userId: string; status: string; user_status?: string }) => {
      if (data.userId === otherUserId) {
        setUserStatus(data.status);
        if (data.user_status) {
          setUserEmoji(data.user_status);
        }
      }
    };

    socket.on('user:status_changed', handleStatusUpdate);

    return () => {
      socket.off('user:status_changed', handleStatusUpdate);
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
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${userStatus === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-gray-300">-</span>
                <span>{userEmoji}</span>
              </div>
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

  useEffect(() => {
    if (!activeChannel) {
      setMessages([]);
      return;
    }

    let mounted = true;
    setLoading(true);

    // Join channel room and wait for acknowledgment
    const joinChannel = async () => {
      return new Promise<void>((resolve, reject) => {
                
        const timeout = setTimeout(() => {
                    socket.off('channel:joined');
          socket.off('channel:error');
          reject(new Error('Channel join timeout'));
        }, 5000);

        socket.once('channel:joined', ({ channelId }: ChannelJoinedEvent) => {
                    if (channelId === activeChannel.id) {
            clearTimeout(timeout);
            resolve();
          }
        });

        socket.once('channel:error', ({ error }: ChannelErrorEvent) => {
                    clearTimeout(timeout);
          reject(new Error(error));
        });

                socket.emit('channel:join', activeChannel.id);
      });
    };

    // Load messages after joining channel
    const loadMessages = async () => {
      try {
                // Wait for channel join acknowledgment
        await joinChannel();
                if (!mounted) return;

        const data = await MessageService.getChannelMessages(activeChannel.id);
                if (!mounted) return;

        setMessages(data.filter(message => !message.threadId));
        setError(null);
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      } catch (err) {
        console.error('Error loading messages:', err);
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
      console.log('🔔 message:created event received:', {
        messageId: message.id,
        content: message.content,
        channelId: message.channelId,
        currentChannel: activeChannel?.id,
        isThread: !!message.threadId
      });

      if (!mounted) {
                return;
      }
      
      if (message.channelId === activeChannel.id && !message.threadId) {
                setMessages(prev => {
          // Check for duplicates
          const isDuplicate = prev.some(m => m.id === message.id);
          if (isDuplicate) {
                        return prev;
          }
                    return [...prev, message];
        });
      } else {
        console.log('❌ Message filtered out:', {
          wrongChannel: message.channelId !== activeChannel.id,
          isThread: !!message.threadId,
          messageChannel: message.channelId,
          currentChannel: activeChannel?.id
        });
      }
    };

    // Listen for real-time message updates
        socket.on('message:created', handleNewMessage);

    return () => {
            mounted = false;
      socket.off('message:created', handleNewMessage);
      
      // Leave channel room and wait for acknowledgment
            const leavePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.off('channel:left');
          socket.off('channel:error');
          reject(new Error('Channel leave timeout'));
        }, 5000);

        socket.once('channel:left', ({ channelId }: ChannelLeftEvent) => {
                    if (channelId === activeChannel.id) {
            clearTimeout(timeout);
            resolve();
          }
        });

        socket.once('channel:error', ({ error }: ChannelErrorEvent) => {
                    clearTimeout(timeout);
          reject(new Error(error));
        });

        socket.emit('channel:leave', activeChannel.id);
      });

      // Handle leave promise
      leavePromise.catch(error => {
        console.error('Error leaving channel:', error);
      });
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
          <MessageInput />
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