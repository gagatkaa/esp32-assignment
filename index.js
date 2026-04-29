process.on("uncaughtException", (err) => {
  console.error("CRASH:", err.message);
  console.error(err.stack);
});

const express = require("express");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const os = require("os");

const app = express();
const port = process.env.PORT || 3000;

const options = {
  key: fs.readFileSync("certs/key.pem"),
  cert: fs.readFileSync("certs/cert.pem"),
};

const server = https.createServer(options, app);
const io = new Server(server);
const clients = {};

app.use(express.static("public"));

function emitClientList() {
  io.emit("clients", clients);
}

app.get("/api/sounds", (req, res) => {
  const soundRoot = path.join(__dirname, "public", "sound");
  const categories = ["boost", "gameOver", "hit"];
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

io.on("connection", (socket) => {
  clients[socket.id] = { id: socket.id };
  console.log(`User connected: ${socket.id}`);
  emitClientList();

  socket.on("signal", (peerId, signal) => {
    console.log(
      `Routing signal ${signal?.type || "unknown"} from ${socket.id} to ${peerId}`,
    );
    io.to(peerId).emit("signal", peerId, signal, socket.id);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    delete clients[socket.id];
    emitClientList();
  });
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