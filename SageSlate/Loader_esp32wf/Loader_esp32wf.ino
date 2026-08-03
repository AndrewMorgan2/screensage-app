#include <WiFi.h>
#include <ctype.h>
#include "srvr.h"
#include "default_image.h"
#include "status_icons.h"

WiFiClient client;

#define MAX_IMAGE_SIZE 15000
uint8_t imageBuffer[MAX_IMAGE_SIZE];
int bytesReceived = 0;
bool receivingImage = false;

unsigned long lastDataTime = 0;
const unsigned long DATA_TIMEOUT = 1000; // 1 second timeout to consider transmission complete

// WiFi status is polled continuously in loop() -- rather than blocking boot
// on a connection -- and the tick/cross icon is kept in sync until the first
// real image arrives, after which we stop touching the display.
bool wifiConnected = false;
bool serverStarted = false;
bool imageLoaded = false;
unsigned long lastWifiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 3000; // 3 seconds between status checks

// Pulls the trailing digits off the hostname (e.g. "einkScreen3" -> 3), or
// -1 if it has none, so setup() can catch a stale default_image.h.
int extractHostnameNumber(const char* name) {
  int len = strlen(name);
  int end = len;
  while (end > 0 && isdigit((unsigned char)name[end - 1])) end--;
  if (end == len) return -1;
  return atoi(name + end);
}

void setup() {
  Serial.begin(115200);
  WiFi.hostname(hostname);

  int hostnameNumber = extractHostnameNumber(hostname);
  if (hostnameNumber != DEFAULT_IMAGE_SCREEN_NUMBER) {
    Serial.println("*************************************************");
    Serial.print("WARNING: default_image.h was baked for screen #");
    Serial.print(DEFAULT_IMAGE_SCREEN_NUMBER);
    Serial.print(" but hostname is \"");
    Serial.print(hostname);
    Serial.println("\".");
    Serial.println("Run make_default_image.py and re-flash to fix.");
    Serial.println("*************************************************");
  }

  // Initialize SPI for the e-Paper
  EPD_initSPI();

  // Kick off the WiFi connection attempt; the ESP/WiFi stack connects in the
  // background, loop() polls WiFi.status() rather than blocking here.
  WiFi.begin(ssid, password);

  // Initialize the e-Paper display and show the default image with
  // whatever status we know right now (almost always "not connected yet").
  EPD_dispIndex = 44;
  wifiConnected = (WiFi.status() == WL_CONNECTED);
  showDefaultImage(wifiConnected);

  if (wifiConnected) {
    server.begin();
    serverStarted = true;
    Serial.println("TCP server started");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  }
}

void loop() {
  // Keep checking WiFi status and updating the on-screen icon until the
  // first real image is loaded -- after that, leave the display alone.
  if (!imageLoaded && millis() - lastWifiCheck > WIFI_CHECK_INTERVAL) {
    lastWifiCheck = millis();
    bool nowConnected = (WiFi.status() == WL_CONNECTED);

    if (nowConnected && !serverStarted) {
      server.begin();
      serverStarted = true;
      Serial.println("TCP server started");
      Serial.print("IP address: ");
      Serial.println(WiFi.localIP());
    }

    if (nowConnected != wifiConnected) {
      wifiConnected = nowConnected;
      showDefaultImage(wifiConnected);
    }
  }

  if (!serverStarted) return;

  // Check if client is connected
  if (!client || !client.connected()) {
    client = server.available();
    if (client) {
      Serial.println("New client connected");
      bytesReceived = 0;
      receivingImage = true;
    }
  }

 // If client is connected, receive data
  if (client && client.connected() && receivingImage) {
    bool dataReceived = false;
    
    while (client.available()) {
      dataReceived = true;
      if (bytesReceived < MAX_IMAGE_SIZE) {
        imageBuffer[bytesReceived] = client.read();
        bytesReceived++;
      } else {
        // Buffer full, discard excess data
        client.read();
      }
    }

    // Update the last data time if we received data
    if (dataReceived) {
      lastDataTime = millis();
    }
    
    // Check if transmission is complete based on timeout
    // or if we've received exactly the expected amount of data
    int width, height;
    getDisplayDimensions(&width, &height);
    int expectedBytes = width * height / 8;
    
    if ((millis() - lastDataTime > DATA_TIMEOUT && bytesReceived > 0) || 
        (bytesReceived == expectedBytes)) {
      
      Serial.print("Received image data: ");
      Serial.print(bytesReceived);
      Serial.println(" bytes");
      
      // Process and display the image
      processImage(imageBuffer, bytesReceived);
      imageLoaded = true; // stop touching the display with WiFi-status redraws

      // Reset for next image
      bytesReceived = 0;
      receivingImage = false;
    }
  }
}

// Stamps a small icon (its own white background baked in) into the bottom-left
// corner of imageBuffer. iconX must stay byte-aligned (multiple of 8) so each
// row can be copied a byte at a time instead of bit-shifted.
void drawStatusIcon(const uint8_t* icon, int iconW, int iconH) {
  const int bufBytesPerRow = 400 / 8; // 50
  const int iconBytesPerRow = iconW / 8;
  const int iconX = 8;
  const int iconY = 300 - iconH - 8;

  for (int row = 0; row < iconH; row++) {
    int destIndex = (iconY + row) * bufBytesPerRow + (iconX / 8);
    for (int b = 0; b < iconBytesPerRow; b++) {
      imageBuffer[destIndex + b] = pgm_read_byte(&icon[row * iconBytesPerRow + b]);
    }
  }
}

void showDefaultImage(bool wifiConnected) {
  Serial.println("Displaying default image...");

  for (unsigned int i = 0; i < sizeof(default_image); i++) {
    imageBuffer[i] = pgm_read_byte(&default_image[i]);
  }

  if (wifiConnected) {
    drawStatusIcon(icon_tick, ICON_TICK_W, ICON_TICK_H);
  } else {
    drawStatusIcon(icon_cross, ICON_CROSS_W, ICON_CROSS_H);
  }

  EPD_dispInit();
  sendBufferToDisplay(imageBuffer, sizeof(default_image));
}

void clearDisplay(bool white) {
  // Initialize the display (init functions reset internally)
  EPD_dispInit();

  Serial.print("Initialized display: ");
  Serial.println(EPD_dispMass[EPD_dispIndex].title);
  
  int width, height;
  getDisplayDimensions(&width, &height);
  
  // Calculate bytes needed
  int bytesNeeded = width * height / 8;
  
  // Send data - 0xFF for white, 0x00 for black
  for (int i = 0; i < bytesNeeded; i++) {
    EPD_SendData(white ? 0xFF : 0x00);
  }
  
  // // For 3-color displays, send the second channel too
  if (EPD_dispMass[EPD_dispIndex].next != -1) {
    EPD_SendCommand(0x13); // DATA_START_TRANSMISSION_2
    for (int i = 0; i < bytesNeeded; i++) {
      EPD_SendData(white ? 0xFF : 0x00);
    }
  }

  int code = EPD_dispMass[EPD_dispIndex].next;

  // e-Paper '2.7' (index 8) needs inverting of image data bits
  EPD_invert = (EPD_dispIndex == 8);

  // If the instruction code isn't '-1', then...
  if (code != -1)
  {
      EPD_SendCommand(code);
      delay(2);
  }

  EPD_dispLoad(); 

  EPD_dispLoad = EPD_dispMass[EPD_dispIndex].chRd;
  
  // Refresh display
  EPD_dispMass[EPD_dispIndex].show();
}

void processImage(uint8_t* buffer, int size) {
  Serial.println("Processing image for e-paper display...");
  
  // Get display dimensions
  int width, height;
  getDisplayDimensions(&width, &height);
  
  // Calculate bytes needed
  int bytesNeeded = width * height / 8;
  
  // Check if we received the correct amount of data
  if (size != bytesNeeded) {
    Serial.print("Warning: Received ");
    Serial.print(size);
    Serial.print(" bytes, expected ");
    Serial.print(bytesNeeded);
    Serial.println(" bytes");
    
    // If we received less data than needed, we'll pad with white
    // If we received more, we'll truncate
    size = min(size, bytesNeeded);
  }
  
  // Initialize the display (init functions reset internally)
  EPD_dispInit();

  // Send the image data directly to the display
  sendBufferToDisplay(buffer, size);
}

void sendBufferToDisplay(uint8_t* buffer, int size) {
  // Get display dimensions
  int width, height;
  getDisplayDimensions(&width, &height);
  
  // Calculate bytes needed
  int bytesNeeded = width * height / 8;
  
  // Send the actual image data
  for (int i = 0; i < min(size, bytesNeeded); i++) {
    EPD_SendData(buffer[i]);
  }
  
  // For 3-color displays, send the second channel too
  if (EPD_dispMass[EPD_dispIndex].next != -1) {
    EPD_SendCommand(0x13); // DATA_START_TRANSMISSION_2
    for (int i = 0; i < bytesNeeded; i++) {
      EPD_SendData(0xFF); // All white for the red channel (no red)
    }
  }
  int code = EPD_dispMass[EPD_dispIndex].next;

  // e-Paper '2.7' (index 8) needs inverting of image data bits
  EPD_invert = (EPD_dispIndex == 8);

  // If the instruction code isn't '-1', then...
  if (code != -1)
  {
      EPD_SendCommand(code);
      delay(2);
  }

  EPD_dispLoad(); 

  EPD_dispLoad = EPD_dispMass[EPD_dispIndex].chRd;
  
  // Refresh display
  EPD_dispMass[EPD_dispIndex].show();
}

void getDisplayDimensions(int* width, int* height) {
  // Set dimensions based on the display type
  switch (EPD_dispIndex) {
    case 0:  // 1.54 inch
      *width = 200;
      *height = 200;
      break;
    case 3:  // 2.13 inch
      *width = 250;
      *height = 122;
      break;
    case 7:  // 2.7 inch
      *width = 264;
      *height = 176;
      break;
    case 9:  // 2.9 inch
      *width = 296;
      *height = 128;
      break;
    case 44: // 4.2 inch
      *width = 400;
      *height = 300;
      break;
    case 19: // 7.5 inch
      *width = 800;
      *height = 480;
      break;
    default:
      *width = 200;
      *height = 200;
  }
}