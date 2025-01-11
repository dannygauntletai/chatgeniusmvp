import { Socket } from 'socket.io';
import { ReactionService } from '../services/reaction.service';

export const handleReactionEvents = (socket: Socket) => {
  // Handle adding reactions
  socket.on('reaction:add', async (data: { messageId: string; emoji: string; userId: string }) => {
    try {
      const reaction = await ReactionService.addReaction(
        data.messageId,
        data.userId,
        data.emoji
      );
      
      // Broadcast the reaction to all clients
      socket.broadcast.emit('reaction:added', {
        messageId: data.messageId,
        reaction: {
          emoji: data.emoji,
          user: reaction.user,
        },
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Handle removing reactions
  socket.on('reaction:remove', async (data: { messageId: string; emoji: string; userId: string }) => {
    try {
      await ReactionService.removeReaction(
        data.messageId,
        data.userId,
        data.emoji
      );
      
      // Broadcast the removal to all clients
      socket.broadcast.emit('reaction:removed', {
        messageId: data.messageId,
        emoji: data.emoji,
        userId: data.userId,
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });
}; 