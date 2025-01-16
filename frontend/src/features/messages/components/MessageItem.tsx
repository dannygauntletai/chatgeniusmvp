import React, { useEffect, useState } from 'react';
import { Message } from '../types/message.types';
import { formatRelativeTime } from '../../../utils/date';
import { useThread } from '../../threads/context';
import { MessageReactions } from './MessageReactions';
import { MessageService } from '../../../services/message.service';
import { socket } from '../../../services/socket.service';
import { useUserContext } from '../../../contexts/UserContext';
import { AudioPlayer } from './AudioPlayer';

interface MessageItemProps {
  message: Message;
  isThreadParent?: boolean;
}

const ASSISTANT_BOT_USER_ID = import.meta.env.VITE_ASSISTANT_BOT_USER_ID || 'assistant-bot';

export const MessageItem: React.FC<MessageItemProps> = ({ message: initialMessage, isThreadParent }) => {
  const [message, setMessage] = useState({
    ...initialMessage,
    reactions: initialMessage.reactions || {}
  });
  const { openThread } = useThread();
  const { userId, username } = useUserContext();

  useEffect(() => {
    const handleMessageCreated = (newMessage: Message) => {
      if (message.content === newMessage.content && (
        message.id.startsWith('temp-') || message.id === newMessage.id
      )) {
        setMessage({
          ...newMessage,
          reactions: newMessage.reactions || {}
        });
      }
    };

    socket.on('message:created', handleMessageCreated);

    return () => {
      socket.off('message:created', handleMessageCreated);
    };
  }, [message.id, message.content]);

  useEffect(() => {
    if (!initialMessage.id.startsWith('temp-')) {
      setMessage({
        ...initialMessage,
        reactions: initialMessage.reactions || {}
      });
    }
  }, [initialMessage]);

  // Socket event handlers for reactions
  useEffect(() => {
    const handleReactionAdded = (data: { messageId: string; reaction: { emoji: string; user: { id: string; username: string } } }) => {
      if (data.messageId === message.id) {
        setMessage(prevMessage => {
          const updatedReactions = { ...prevMessage.reactions };
          if (!updatedReactions[data.reaction.emoji]) {
            updatedReactions[data.reaction.emoji] = [];
          }
          if (!updatedReactions[data.reaction.emoji].some(user => user.id === data.reaction.user.id)) {
            updatedReactions[data.reaction.emoji].push(data.reaction.user);
          }
          return { ...prevMessage, reactions: updatedReactions };
        });
      }
    };

    const handleReactionRemoved = (data: { messageId: string; emoji: string; userId: string }) => {
      if (data.messageId === message.id) {
        setMessage(prevMessage => {
          const updatedReactions = { ...prevMessage.reactions };
          if (updatedReactions[data.emoji]) {
            updatedReactions[data.emoji] = updatedReactions[data.emoji].filter(
              user => user.id !== data.userId
            );
            if (updatedReactions[data.emoji].length === 0) {
              delete updatedReactions[data.emoji];
            }
          }
          return { ...prevMessage, reactions: updatedReactions };
        });
      }
    };

    socket.on('reaction:added', handleReactionAdded);
    socket.on('reaction:removed', handleReactionRemoved);

    return () => {
      socket.off('reaction:added', handleReactionAdded);
      socket.off('reaction:removed', handleReactionRemoved);
    };
  }, [message.id]);

  const handleThreadClick = async () => {
    if (message.id.startsWith('temp-')) {
      console.log('Message is still being saved, waiting...');
      return;
    }
    openThread(message.id, message);
  };

  const handleReactionAdd = async (messageId: string, emoji: string) => {
    try {
      console.log('Adding reaction to message:', messageId, emoji);
      setMessage(prevMessage => {
        const updatedReactions = { ...prevMessage.reactions };
        if (!updatedReactions[emoji]) {
          updatedReactions[emoji] = [];
        }
        if (userId && username) {
          const currentUser = { id: userId, username };
          if (!updatedReactions[emoji].some(user => user.id === currentUser.id)) {
            updatedReactions[emoji].push(currentUser);
          }
        }
        return { ...prevMessage, reactions: updatedReactions };
      });
      
      await MessageService.addReaction(messageId, emoji);
    } catch (error) {
      console.error('Failed to add reaction:', error);
      setMessage(prevMessage => ({
        ...prevMessage,
        reactions: message.reactions || {}
      }));
    }
  };

  const handleReactionRemove = async (messageId: string, emoji: string) => {
    try {
      console.log('Removing reaction from message:', messageId, emoji);
      setMessage(prevMessage => {
        const updatedReactions = { ...prevMessage.reactions };
        if (updatedReactions[emoji]) {
          updatedReactions[emoji] = updatedReactions[emoji].filter(
            user => user.id !== userId
          );
          if (updatedReactions[emoji].length === 0) {
            delete updatedReactions[emoji];
          }
        }
        return { ...prevMessage, reactions: updatedReactions };
      });

      await MessageService.removeReaction(messageId, emoji);
    } catch (error) {
      console.error('Failed to remove reaction:', error);
      setMessage(prevMessage => ({
        ...prevMessage,
        reactions: message.reactions || {}
      }));
    }
  };

  const isOwnMessage = message.userId === userId;
  const isAssistantMessage = message.userId === ASSISTANT_BOT_USER_ID;

  const renderContent = () => {
    // Check if the content is an MP3 link
    if (message.content.trim().toLowerCase().endsWith('.mp3')) {
      const displayText = message.content.length > 60 ? message.content.substring(0, 57) + '...' : message.content;
      const isOnlyUrl = message.content.trim().startsWith('http');
      
      return (
        <>
          {!isOnlyUrl && (
            <div className="mt-1 mb-2 text-sm text-white">
              {displayText}
            </div>
          )}
          <div className="mt-2">
            <AudioPlayer 
              url={message.content}
            />
          </div>
        </>
      );
    }

    return (
      <div className="mt-1 text-sm text-white">
        {message.content}
      </div>
    );
  };

  if (!message || !message.user) {
    return null;
  }

  return (
    <div className="group relative flex items-start space-x-3 py-4 px-4 hover:bg-gray-700">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
          <span className="text-sm font-medium text-white">
            {isAssistantMessage ? 'A' : message.user.username[0].toUpperCase()}
          </span>
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-white">{message.user.username}</span>
            <span className="text-xs text-gray-300">
              {formatRelativeTime(new Date(message.createdAt))}
            </span>
          </div>
        </div>

        {renderContent()}

        <div className="mt-2 flex items-center space-x-2">
          <MessageReactions
            messageId={message.id}
            reactions={message.reactions}
            onReactionAdd={handleReactionAdd}
            onReactionRemove={handleReactionRemove}
          />

          {!isThreadParent && (
            <button
              onClick={handleThreadClick}
              className={`inline-flex items-center p-1.5 text-xs font-medium rounded-full ${
                message.id.startsWith('temp-')
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
              }`}
              disabled={message.id.startsWith('temp-')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}; 