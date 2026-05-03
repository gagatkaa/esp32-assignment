# ESP32 Tank Game

Web-based shooting game controlled by ESP32 with joystick and buttons.

## How it works

### Hardware (ESP32)
- Joystick connected to pins 15 (X) and 16 (Y)
- 4 buttons: UP (8), DOWN (5), LEFT (4), RIGHT (7)
- 5 LED indicators for lives: pins 20, 21, 47, 48, 42
- ESP32 sends data over Serial (115200 baud) to the browser using Web Serial API

### What ESP32 sends

ESP32 sends JSON messages over Serial:

**Aim data** (sent continuously, ~50 times per second):
```
{"aim":{"x":0.75,"y":-0.32}}
```
- X and Y values range from -1.0 to 1.0
- Deadzone of 350 applied (values below this are treated as 0)
- Controls where the tank barrel points

**Move data** (sent when buttons pressed/released):
```
{"move":{"x":-1,"y":0}}
```
- X: -1 (left), 0 (none), 1 (right)
- Y: -1 (up), 0 (none), 1 (down)
- Only one direction per axis at a time
- Controls tank movement

**Restart** (sent when any button pressed from idle state, only if game is over):
```
{"restart":true}
```

### How web app reads data

1. User clicks "Connect ESP32" button in browser
2. Browser requests serial port access (Web Serial API)
3. ESP32 connects at 115200 baud
4. Web app reads serial data line by line
5. Each line is parsed as JSON
6. `handleEsp32Message()` updates game state:
   - `msg.aim` → updates `aimX` and `aimY` (normalized to unit vector)
   - `msg.move` → updates `moveX` and `moveY` (clamped to -1..1)
   - `msg.restart` → calls `restartGame()` if game over

### Game mechanics

- Tank starts in center of screen
- Joystick aims the barrel
- Buttons move the tank (WASD style)
- Tank auto-shoots in aim direction while moving (every 220ms)
- Enemies spawn from screen edges and chase the tank
- Shoot enemies to score points
- 5 lives, lose one on enemy contact
- Game over when all lives lost, press any button to restart

### Power-ups
- Green: +1 life
- Blue: Big bullets (10s)
- Dark blue: Triple shot (10s)
- Purple: Nuke (kills all enemies)
- Light purple: Slow enemies (10s)

### Setup

#### Prerequisites
- Node.js installed
- Chrome or Edge browser (required for Web Serial API)
- SSL certificates in `certs/` directory (`cert.pem` and `key.pem`)

#### SSL Certificates
The `certs/` directory is gitignored. Generate self-signed certificates:
```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"
```

#### Steps
1. Install dependencies: `npm install`
2. Upload `esp32_controller/esp32_controller.ino` to ESP32 using Arduino IDE
3. Connect joystick and buttons to pins as defined in code
4. Run server: `npm start`
5. Open `https://<your-ip>:3000` in Chrome/Edge (accept the self-signed certificate warning)
6. Click "Connect ESP32" and select the serial port
7. Click "LET'S GO !!" to start
