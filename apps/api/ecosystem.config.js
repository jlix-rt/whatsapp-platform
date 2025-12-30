module.exports = {
  apps: [
    {
      name: "whatsapp-api",
      script: "index.js",
      cwd: "/var/www/apps/whatsapp-api",
      env_file: "/var/www/apps/whatsapp-api/.env",
      instances: 1,
      exec_mode: "fork"
    }
  ]
};