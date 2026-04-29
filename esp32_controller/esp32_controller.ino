#define VRX_PIN 15
#define VRY_PIN 16

#define BTN_UP 6
#define BTN_DOWN 5
#define BTN_LEFT 4
#define BTN_RIGHT 7

const int JOY_CENTER_X = 2048;
const int JOY_CENTER_Y = 2048;
const int JOY_DEADZONE = 350;

int lastBtnState = 0;

bool isPressed(int pin) {
  return digitalRead(pin) == LOW;
}

float normalizeAxis(int raw, int center) {
  int diff = raw - center;

  if (abs(diff) < JOY_DEADZONE) {
    return 0.0;
  }

  float value = diff / 2048.0;
  return constrain(value, -1.0, 1.0);
}

void sendMove(float x, float y) {
  Serial.print("{\"move\":{\"x\":");
  Serial.print(x, 2);
  Serial.print(",\"y\":");
  Serial.print(y, 2);
  Serial.println("}}");
}

void sendAim(float x, float y) {
  Serial.print("{\"aim\":{\"x\":");
  Serial.print(x, 2);
  Serial.print(",\"y\":");
  Serial.print(y, 2);
  Serial.println("}}");
}

void sendRestart() {
  Serial.println("{\"restart\":true}");
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(BTN_LEFT, INPUT_PULLUP);
  pinMode(BTN_DOWN, INPUT_PULLUP);
  pinMode(BTN_UP, INPUT_PULLUP);
  pinMode(BTN_RIGHT, INPUT_PULLUP);
}

void loop() {
  int rawX = analogRead(VRX_PIN);
  int rawY = analogRead(VRY_PIN);

  float aimX = normalizeAxis(rawX, JOY_CENTER_X);
  float aimY = normalizeAxis(rawY, JOY_CENTER_Y);

  sendAim(aimX, aimY);

  bool left = isPressed(BTN_LEFT);
  bool right = isPressed(BTN_RIGHT);
  bool up = isPressed(BTN_UP);
  bool down = isPressed(BTN_DOWN);

  int btnState =
    (left ? 1 : 0) |
    (right ? 2 : 0) |
    (up ? 4 : 0) |
    (down ? 8 : 0);

  if (btnState != 0 && lastBtnState == 0) {
    sendRestart();
  }

  if (btnState != lastBtnState) {
    float moveX = 0;
    float moveY = 0;

    if (left && !right) {
      moveX = -1;
    } else if (right && !left) {
      moveX = 1;
    }

    if (up && !down) {
      moveY = -1;
    } else if (down && !up) {
      moveY = 1;
    }

    sendMove(moveX, moveY);
    lastBtnState = btnState;
  }

  delay(20);
}