import dotenv from 'dotenv';

// Load environment variables before any other imports
dotenv.config();

// Import app after environment variables are loaded
import { app } from './app';

// Export app for potential use in tests
export { app }; 