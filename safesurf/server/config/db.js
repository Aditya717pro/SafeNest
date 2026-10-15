/**
 * MongoDB Database Connection Configuration
 */

import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/safesurf';
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000 // 5s timeout if MongoDB is not running locally
    });
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.warn(`[Database] MongoDB Connection Note: ${err.message}`);
    console.warn('[Database] Running in offline/mock-db fallback mode until MongoDB is started.');
    return null;
  }
}
