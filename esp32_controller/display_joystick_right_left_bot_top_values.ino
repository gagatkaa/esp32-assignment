// joystick
#define VRX_PIN 15
#define VRY_PIN 16

// buttons
#define BTN_LEFT 4
#define BTN_DOWN 5
#define BTN_UP 6
#define BTN_RIGHT 7

const int LOW_LIMIT = 1200;
const int HIGH_LIMIT = 2800;

bool isPressed(int pin) {
  return digitalRead(pin) == LOW;  // INPUT_PULLUP: pressed = LOW
}

String getJoystickDirection(int x, int y) {
  bool left = x < LOW_LIMIT;
  bool right = x > HIGH_LIMIT;
  bool down = y > HIGH_LIMIT;
  bool up = y < LOW_LIMIT;

  if (left && up) return "JOYSTICK LEFT UP";
  if (left && down) return "JOYSTICK LEFT DOWN";
  if (right && up) return "JOYSTICK RIGHT UP";
  if (right && down) return "JOYSTICK RIGHT DOWN";
  if (left) return "JOYSTICK LEFT";
  if (right) return "JOYSTICK RIGHT";
  if (up) return "JOYSTICK UP";
  if (down) return "JOYSTICK DOWN";

  return "";
}

void printButtonAction(const char* label, int pin, bool& hasAction) {
  if (isPressed(pin)) {
    Serial.print(label);
    Serial.print(" ");
    hasAction = true;
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  pinMode(BTN_LEFT, INPUT_PULLUP);
  pinMode(BTN_DOWN, INPUT_PULLUP);
  pinMode(BTN_UP, INPUT_PULLUP);
  pinMode(BTN_RIGHT, INPUT_PULLUP);

  Serial.println("joystick + buttons ready");
}

void loop() {
  int joystick_x = analogRead(VRX_PIN);
  int joystick_y = analogRead(VRY_PIN);

  bool hasAction = false;

  printButtonAction("LEFT", BTN_LEFT, hasAction);
  printButtonAction("DOWN", BTN_DOWN, hasAction);
  printButtonAction("UP", BTN_UP, hasAction);
  printButtonAction("RIGHT", BTN_RIGHT, hasAction);

  String joystickDirection = getJoystickDirection(joystick_x, joystick_y);

  if (joystickDirection != "") {
    Serial.print(joystickDirection);
    Serial.print(" ");
    hasAction = true;
  }

  if (hasAction) {
    Serial.print("| X: ");
    Serial.print(joystick_x);
    Serial.print(" Y: ");
    Serial.println(joystick_y);
  }

  delay(100);
}