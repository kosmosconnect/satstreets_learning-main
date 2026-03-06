import mysql from "mysql2/promise";
import dotenv from 'dotenv';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const dbHost = isProd ? process.env.DB_HOST : (process.env.DB_HOST_LOCAL || process.env.DB_HOST);
const dbUser = isProd ? process.env.DB_USER : (process.env.DB_USER_LOCAL || process.env.DB_USER);
const dbPass = isProd ? process.env.DB_PASS : (process.env.DB_PASS_LOCAL || process.env.DB_PASS);
const dbName = isProd ? process.env.DB_NAME : (process.env.DB_NAME_LOCAL || process.env.DB_NAME);

const db = await mysql.createPool({
    host: dbHost,
    user: dbUser,
    password: dbPass,
    database: dbName,
})

export default db;
