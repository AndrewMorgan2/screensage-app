#include <WiFi.h>
#include "srvr.h" 

WiFiClient client;

#define MAX_IMAGE_SIZE 15000
uint8_t imageBuffer[MAX_IMAGE_SIZE];
int bytesReceived = 0;
bool receivingImage = false;

unsigned long lastDataTime = 0;
const unsigned long DATA_TIMEOUT = 1000; // 1 second timeout to consider transmission complete

void setup() {
  Serial.begin(115200);
  WiFi.hostname(hostname);
  
  // Initialize SPI for the e-Paper
  EPD_initSPI();
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  // Start TCP server
  server.begin();
  Serial.println("TCP server started");
  
  // Initialize the e-Paper display
  EPD_dispIndex = 44;
  
  clearDisplay(false);
}

void loop() {
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
      
      // Reset for next image
      bytesReceived = 0;
      receivingImage = false;
    }
  }
}

void clearDisplay(bool white) {
  // Reset and initialize the display
  EPD_Reset();
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
  
  // Reset and initialize the display
  EPD_Reset();
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