import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { AuthenticatedRequest } from '../types/request.types';

// Update MulterRequest type using the global Express namespace
interface MulterRequest extends AuthenticatedRequest {
  file?: Express.Multer.File;
}

const PUBLIC_BUCKET_NAME = 'Public Files';
const ASSISTANT_SERVICE_URL = process.env.ASSISTANT_SERVICE_URL || 'http://localhost:8000';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export class FileController {
  async uploadFile(req: MulterRequest, res: Response) {
    try {
      if (!req.file) {
        console.error('No file in request');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('File details:', {
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        encoding: req.file.encoding
      });

      // Use authenticated user's ID if no userId provided in body
      const userId = req.body.userId || req.auth.userId;
      if (!userId) {
        console.error('No user ID found in request');
        return res.status(400).json({ error: 'User ID is required' });
      }
      
      let targetChannelId = req.body.channelId;
      
      // If no channel specified, use public bucket
      if (!targetChannelId || targetChannelId === 'undefined') {
                const publicBucket = await this.getOrCreatePublicBucket(userId);
        targetChannelId = publicBucket.id;
      }

      // Verify channel access and ensure user membership
            let channel = await prisma.channel.findFirst({
        where: { id: targetChannelId },
        include: { members: true }
      });

      console.log('Channel lookup result:', {
        found: !!channel,
        channelId: targetChannelId,
        name: channel?.name,
        memberCount: channel?.members?.length,
        isOwner: channel?.ownerId === userId,
        isMember: channel?.members?.some(m => m.id === userId)
      });

      // If channel not found, check if it's meant to be public bucket
      if (!channel) {
                channel = await prisma.channel.findFirst({
          where: { name: PUBLIC_BUCKET_NAME },
          include: { members: true }
        });
        
        if (channel) {
                    targetChannelId = channel.id;
        }
      }

      // Create public bucket if needed
      if (!channel && (!targetChannelId || targetChannelId === 'undefined')) {
                channel = await prisma.channel.create({
          data: {
            name: PUBLIC_BUCKET_NAME,
            isPrivate: false,
            ownerId: userId,
            members: {
              connect: { id: userId }
            }
          },
          include: { members: true }
        });
        targetChannelId = channel.id;
      }

      if (!channel) {
        console.error('Channel not found:', targetChannelId);
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Check if user has access (is owner or member)
      const hasAccess = channel.ownerId === userId || channel.members.some(m => m.id === userId);
      
      // For public bucket, automatically add user as member if not already
      if (!hasAccess && channel.name === PUBLIC_BUCKET_NAME) {
                await prisma.channel.update({
          where: { id: channel.id },
          data: {
            members: {
              connect: { id: userId }
            }
          }
        });
      } else if (!hasAccess) {
        console.error('User does not have access to channel:', {
          userId,
          channelId: targetChannelId,
          error: 'User is not a member'
        });
        return res.status(403).json({ error: 'Access denied to channel' });
      }

      // Upload file to Supabase Storage
            const fileBuffer = req.file.buffer;
      const fileName = `${uuidv4()}-${req.file.originalname}`;
            
            const { error: uploadError } = await supabase
        .storage
        .from('chat-genius-files')
        .upload(fileName, fileBuffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload file to storage' });
      }
      
      // Get the public URL for the uploaded file
            const { data: { publicUrl } } = supabase
        .storage
        .from('chat-genius-files')
        .getPublicUrl(fileName);
      
      const file = {
        id: uuidv4(),
        name: req.file.originalname,
        type: req.file.mimetype,
        url: publicUrl,
        channelId: targetChannelId,
        userId: userId
      };

            const fileRecord = await prisma.file.create({
        data: file
      });
      
      // Process document immediately after successful upload
      try {
                const response = await fetch(`${ASSISTANT_SERVICE_URL}/document/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            file_id: fileRecord.id,
            file_url: fileRecord.url,
            channel_id: fileRecord.channelId,
            uploader_id: fileRecord.userId,
            file_name: fileRecord.name,
            file_type: fileRecord.type
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Document processing error response:', errorText);
        } else {
                  }
      } catch (processingError) {
        console.error('Error initiating document processing:', processingError);
        // Don't fail the upload if processing fails
      }

            return res.json(fileRecord);
    } catch (error) {
      console.error('Unhandled error in file upload:', error);
      return res.status(500).json({ error: 'Failed to upload file' });
    }
  }

  async getChannelFiles(req: Request, res: Response) {
    try {
            const files = await prisma.file.findMany({
        where: { channelId: req.params.channelId },
        orderBy: { createdAt: 'desc' },
        include: { user: true, channel: true }
      });
            return res.json(files);
    } catch (error) {
      console.error('Error getting channel files:', error);
      return res.status(500).json({ error: 'Failed to get channel files' });
    }
  }

  async getUserFiles(req: Request, res: Response) {
    try {
      const files = await prisma.file.findMany({
        where: { userId: req.params.userId },
        orderBy: { createdAt: 'desc' },
        include: { user: true, channel: true }
      });
      return res.json(files);
    } catch (error) {
      console.error('Error getting user files:', error);
      return res.status(500).json({ error: 'Failed to get user files' });
    }
  }

  async getAllFiles(_req: Request, res: Response) {
    try {
            const files = await prisma.file.findMany({
        orderBy: { createdAt: 'desc' },
        include: { user: true, channel: true }
      });
            return res.json(files);
    } catch (error) {
      console.error('Error getting all files:', error);
      return res.status(500).json({ error: 'Failed to get files' });
    }
  }

  private async getOrCreatePublicBucket(userId: string) {
        
    // Check if public bucket exists
    let publicBucket = await prisma.channel.findFirst({
      where: { name: PUBLIC_BUCKET_NAME },
      include: {
        members: true
      }
    });

    // Create public bucket if it doesn't exist
    if (!publicBucket) {
            publicBucket = await prisma.channel.create({
        data: {
          name: PUBLIC_BUCKET_NAME,
          isPrivate: false,
          ownerId: userId,
          members: {
            connect: { id: userId }
          }
        },
        include: {
          members: true
        }
      });
          }

    // Check if user is a member
    const isMember = publicBucket.members.some(member => member.id === userId);
    
    // Add user as member if not already
    if (!isMember) {
            try {
        await prisma.channel.update({
          where: { id: publicBucket.id },
          data: {
            members: {
              connect: { id: userId }
            }
          },
          include: {
            members: true
          }
        });
              } catch (error) {
        console.error('Error adding user to public bucket:', error);
        throw error;
      }
    }

    return publicBucket;
  }
} 