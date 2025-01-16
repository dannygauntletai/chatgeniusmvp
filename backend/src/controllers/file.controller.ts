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
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Use authenticated user's ID if no userId provided in body
      const userId = req.body.userId || req.auth.userId;
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      let targetChannelId = req.body.channelId;
      
      // If no channel specified or channel is 'undefined', use public bucket
      if (!targetChannelId || targetChannelId === 'undefined') {
        console.log('No valid channel ID provided, using public bucket');
        const publicBucket = await this.getOrCreatePublicBucket(userId);
        targetChannelId = publicBucket.id;
      } else {
        // Verify user has access to the channel
        const channel = await prisma.channel.findFirst({
          where: {
            id: targetChannelId,
            OR: [
              { ownerId: userId },
              { members: { some: { id: userId } } }
            ]
          }
        });

        if (!channel) {
          return res.status(403).json({ error: 'Access denied to channel' });
        }
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
        console.error('Error uploading to Supabase:', uploadError);
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
        console.log('Initiating document processing for:', fileRecord.name);
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
          console.error('Document processing error:', await response.text());
        } else {
          console.log('Document processing initiated successfully');
        }
      } catch (processingError) {
        console.error('Error initiating document processing:', processingError);
        // Don't fail the upload if processing fails
      }

      return res.json(fileRecord);
    } catch (error) {
      console.error('Error uploading file:', error);
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

  private async getOrCreatePublicBucket(userId: string) {
    // Check if public bucket exists
    let publicBucket = await prisma.channel.findFirst({
      where: { name: PUBLIC_BUCKET_NAME }
    });

    // Create public bucket if it doesn't exist
    if (!publicBucket) {
      publicBucket = await prisma.channel.create({
        data: {
          id: uuidv4(),
          name: PUBLIC_BUCKET_NAME,
          isPrivate: false,
          ownerId: userId,
          members: {
            connect: { id: userId }
          }
        }
      });
    } else {
      // Check if user is a member
      const isMember = await prisma.channel.findFirst({
        where: {
          id: publicBucket.id,
          members: {
            some: { id: userId }
          }
        }
      });

      // Add user as member if not already
      if (!isMember) {
        await prisma.channel.update({
          where: { id: publicBucket.id },
          data: {
            members: {
              connect: { id: userId }
            }
          }
        });
      }
    }

    return publicBucket;
  }
} 