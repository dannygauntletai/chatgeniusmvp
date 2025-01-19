import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
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
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const { openThread } = useThread();
  const { userId, username } = useUserContext();
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  useEffect(() => {
    // Cleanup audio on unmount
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);

  const handleThreadClick = async () => {
    if (message.id.startsWith('temp-')) {
            return;
    }
    openThread(message.id, message);
  };

  const handleReactionAdd = async (messageId: string, emoji: string) => {
    try {
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

  const isAssistantMessage = message.userId === ASSISTANT_BOT_USER_ID;

  const handleTextToSpeech = async () => {
    try {
      // If already playing, stop and cleanup
      if (isPlaying && audioRef.current) {
        console.log('Stopping current playback');
        audioRef.current.pause();
        setIsPlaying(false);
        return;
      }

      console.log('Starting TTS request...');
      const startTime = performance.now();

      // Check cache first
      const CACHE_NAME = 'tts-cache-v1';
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = `tts-${message.id}`; // Use text as key
      const cachedResponse = await cache.match(cacheKey);

      if (cachedResponse) {
        console.log('Found cached audio');
        const blob = await cachedResponse.blob();
        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.addEventListener('ended', () => {
            console.log('Audio playback ended');
            setIsPlaying(false);
          });
        }
        audioRef.current.src = URL.createObjectURL(blob);
        await audioRef.current.play();
        setIsPlaying(true);
        return;
      }

      // Create MediaSource instance
      const mediaSource = new MediaSource();
      let sourceBuffer: SourceBuffer | null = null;
      
      // Create audio element if it doesn't exist
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.addEventListener('ended', () => {
          console.log('Audio playback ended');
          setIsPlaying(false);
        });
      }

      // Set up MediaSource
      const sourceOpenPromise = new Promise<void>((resolve) => {
        mediaSource.addEventListener('sourceopen', () => {
          console.log('MediaSource opened');
          sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
          sourceBuffer.mode = 'sequence';
          resolve();
        });
      });

      // Set audio source to MediaSource URL
      const mediaSourceUrl = URL.createObjectURL(mediaSource);
      audioRef.current.src = mediaSourceUrl;
      
      // Start the TTS request
      const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream", {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': import.meta.env.VITE_ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: message.content,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      // Clone the response for caching
      const responseClone = response.clone();
      cache.put(cacheKey, responseClone);

      console.log(`Response received in ${(performance.now() - startTime).toFixed(2)}ms`);

      // Wait for MediaSource to be ready
      await sourceOpenPromise;
      
      let isFirstChunk = true;
      const reader = response.body?.getReader();
      let totalSize = 0;

      console.log('Starting to receive and play chunks...');

      if (reader && sourceBuffer) {
        while (true) {
          const { done, value } = await reader.read();
          const typedSourceBuffer = sourceBuffer as SourceBuffer;


          if (done) {
            console.log('Stream complete');
            if (mediaSource.readyState === 'open') {
              if (typedSourceBuffer.updating) {
                  await new Promise<void>(resolve => {
                      typedSourceBuffer.addEventListener('updateend', () => {
                          if (!typedSourceBuffer.updating) {
                              mediaSource.endOfStream();
                          }
                          resolve();
                      }, { once: true });
                  });
                } else {
                    mediaSource.endOfStream();
                }
            }
            break;
          }

          totalSize += value.length;
          console.log(`Received chunk: ${value.length} bytes (Total: ${(totalSize / 1024).toFixed(2)}KB)`);

          // Wait for previous updates to complet
          if (typedSourceBuffer.updating) {
            await new Promise<void>(resolve => {
              typedSourceBuffer.addEventListener('updateend', () => resolve(), {
                    once: true 
                });
            });
          }

          // Append the chunk to the source buffer
          typedSourceBuffer.appendBuffer(value);

          // Start playing after receiving the first chunk
          if (isFirstChunk) {
            console.log('Starting playback with first chunk');
            await audioRef.current.play();
            setIsPlaying(true);
            isFirstChunk = false;
            console.log(`Time to first playback: ${(performance.now() - startTime).toFixed(2)}ms`);
          }
        }
      }

    } catch (error) {
      console.error('Failed to generate speech:', error);
      setIsPlaying(false);
    }
  };

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
            <AudioPlayer url={message.content} />
          </div>
        </>
      );
    }

    return (
      <div className="mt-1 text-sm text-white prose prose-invert max-w-none">
        <ReactMarkdown>{message.content}</ReactMarkdown>
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
            <>
              {isAssistantMessage && !message.content.trim().toLowerCase().endsWith('.mp3') ? (
                <button
                  onClick={handleTextToSpeech}
                  className="inline-flex items-center p-1.5 text-xs font-medium rounded-full text-gray-700 bg-gray-100 hover:bg-gray-200"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  </svg>
                </button>
              ) : !isAssistantMessage && (
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}; 