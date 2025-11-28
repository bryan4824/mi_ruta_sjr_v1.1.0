import 'dotenv/config';

export const {
    PORT = 3000,
    SALT_ROUNDS = 10,
    SECRET_JWT_KEY = 'mY5ecrbryK3y!2025@JWT-syet%$%822894536',
    // MONGODB_URL_DB = 'mongodb+srv://mirutasjr_db_user:6RtYaL8HPK46mkbU@cluster0.jjytndq.mongodb.net/?appName=Cluster0',
    EMAIL_USER = 'mirutasjr@gmail.com',
    EMAIL_PASS = 'ztjrclzakuexlvtp'
} = process.env
