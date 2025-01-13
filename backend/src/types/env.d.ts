declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string;
    JWT_SECRET: string;
    PORT: string;
    NODE_ENV: 'development' | 'production' | 'test';
    ASSISTANT_SERVICE_URL: string;
    ASSISTANT_BOT_USER_ID: string;
  }
} 