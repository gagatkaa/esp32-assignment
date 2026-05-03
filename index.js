process.on("uncaughtException", (err) => {
  console.error("CRASH:", err.message);
  console.error(err.stack);
});

const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const port = process.env.PORT || 3000;

const options = {
  key: fs.readFileSync("certs/key.pem"),
  cert: fs.readFileSync("certs/cert.pem"),
};

const server = https.createServer(options, app);

app.use(express.static("public"));

app.get("/api/sounds", (req, res) => {
  const soundRoot = path.join(__dirname, "public", "sound");
  const categories = ["boost", "gameOver", "hit", "playerhit"];
  const sounds = {};

  for (const category of categories) {
    const dir = path.join(soundRoot, category);

    if (!fs.existsSync(dir)) {
      sounds[category] = [];
      continue;
    }

    sounds[category] = fs
      .readdirSync(dir)
      .filter((file) => /\.(mp3|wav|ogg)$/i.test(file))
      .map((file) => `/sound/${category}/${encodeURIComponent(file)}`);
  }

  const musicPath = path.join(soundRoot, "music.mp3");
  sounds.music = fs.existsSync(musicPath) ? ["/sound/music.mp3"] : [];

  res.json(sounds);
});

server.listen(port, "0.0.0.0", () => {
  const networkInterfaces = os.networkInterfaces();

  for (const interfaceName in networkInterfaces) {
    for (const iface of networkInterfaces[interfaceName]) {
      if (iface.family === "IPv4" && !iface.internal) {
        console.log(`https://${iface.address}:${port}`);
      }
    }
  }

  console.log(`App listening on port ${port}`);
});