module.exports = {
  apps: [
    {
      name: "whatsapp-inbox",
      script: "dist/index.js",
      env_file: ".env",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "300M"
    }
  ]
};
