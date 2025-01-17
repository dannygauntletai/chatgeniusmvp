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
      console.log('\n=== FILE UPLOAD ENDPOINT HIT ===');
      console.log('Headers:', req.headers);
      
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
      console.log('User ID:', userId);

      let targetChannelId = req.body.channelId;
      console.log('Requested channel ID:', targetChannelId);

      // If no channel specified, use public bucket
      if (!targetChannelId || targetChannelId === 'undefined') {
        console.log('No channel ID provided, getting/creating public bucket...');
        const publicBucket = await this.getOrCreatePublicBucket(userId);
        targetChannelId = publicBucket.id;
      }

      // Verify channel access and ensure user membership
      console.log('Verifying channel access...');
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
        console.log('Channel not found, checking if public bucket exists...');
        channel = await prisma.channel.findFirst({
          where: { name: PUBLIC_BUCKET_NAME },
          include: { members: true }
        });
        
        if (channel) {
          console.log('Found public bucket, using it instead');
          targetChannelId = channel.id;
        }
      }

      // Create public bucket if needed
      if (!channel && (!targetChannelId || targetChannelId === 'undefined')) {
        console.log('Creating new public bucket...');
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
        console.log('Adding user to public bucket...');
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
      console.log('Preparing Supabase upload...');
      const fileBuffer = req.file.buffer;
      const fileName = `${uuidv4()}-${req.file.originalname}`;
      console.log('Generated filename:', fileName);
      
      console.log('Uploading to Supabase...');
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
      console.log('Supabase upload successful');

      // Get the public URL for the uploaded file
      console.log('Getting public URL...');
      const { data: { publicUrl } } = supabase
        .storage
        .from('chat-genius-files')
        .getPublicUrl(fileName);
      console.log('Public URL:', publicUrl);

      const file = {
        id: uuidv4(),
        name: req.file.originalname,
        type: req.file.mimetype,
        url: publicUrl,
        channelId: targetChannelId,
        userId: userId
      };

      console.log('Creating database record...');
      const fileRecord = await prisma.file.create({
        data: file
      });
      console.log('Database record created:', fileRecord.id);

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
          const errorText = await response.text();
          console.error('Document processing error response:', errorText);
        } else {
          console.log('Document processing initiated successfully');
        }
      } catch (processingError) {
        console.error('Error initiating document processing:', processingError);
        // Don't fail the upload if processing fails
      }

      console.log('Upload process completed successfully');
      return res.json(fileRecord);
    } catch (error) {
      console.error('Unhandled error in file upload:', error);
      return res.status(500).json({ error: 'Failed to upload file' });
    }
  }

  async getChannelFiles(req: Request, res: Response) {
    try {
      console.log('Getting files for channel:', req.params.channelId);
      const files = await prisma.file.findMany({
        where: { channelId: req.params.channelId },
        orderBy: { createdAt: 'desc' },
        include: { user: true, channel: true }
      });
      console.log('Found files:', files.length);
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
      console.log('Getting all files');
      const files = await prisma.file.findMany({
        orderBy: { createdAt: 'desc' },
        include: { user: true, channel: true }
      });
      console.log('Found files:', files.length);
      return res.json(files);
    } catch (error) {
      console.error('Error getting all files:', error);
      return res.status(500).json({ error: 'Failed to get files' });
    }
  }

  private async getOrCreatePublicBucket(userId: string) {
    console.log('Getting or creating public bucket for user:', userId);
    
    // Check if public bucket exists
    let publicBucket = await prisma.channel.findFirst({
      where: { name: PUBLIC_BUCKET_NAME },
      include: {
        members: true
      }
    });

    console.log('Existing public bucket:', publicBucket);

    // Create public bucket if it doesn't exist
    if (!publicBucket) {
      console.log('Creating new public bucket...');
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
      console.log('Created new public bucket:', publicBucket.id);
    }

    // Check if user is a member
    const isMember = publicBucket.members.some(member => member.id === userId);
    console.log('Is user member of public bucket:', isMember);

    // Add user as member if not already
    if (!isMember) {
      console.log('Adding user to public bucket members...');
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
        console.log('Successfully added user to public bucket');
      } catch (error) {
        console.error('Error adding user to public bucket:', error);
        throw error;
      }
    }

    return publicBucket;
  }
} 