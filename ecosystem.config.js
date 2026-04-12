module.exports = {
  apps: [{
    name: 'detectable-cc',
    script: './backend/server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      // Set JWT_SECRET via: pm2 set detectable-cc:JWT_SECRET "your-secret"
      // or export JWT_SECRET="..." before pm2 start
    },
  }],
};
