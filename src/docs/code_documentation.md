# Screen Sage - Code Documentation

## Project Structure

```
src/
├── main.rs                 # Application entry point and route configuration
├── models.rs              # Data structures and type definitions
├── handlers.rs            # Core HTTP handlers and command execution
├── battle_handlers.rs     # Combat tracker functionality
├── image_handlers.rs      # Media file browser and serving
├── image_gen_handlers.rs  # AI image generation integration
├── upload_handlers.rs     # File upload handling
├── json_handlers.rs       # JSON file read/write operations
├── sageslate_handlers.rs  # E-ink display controller
├── vtt_handler.rs         # Virtual tabletop interface
├── display_handler.rs     # General display controller
├── commands.rs            # Predefined command definitions
├── template_loader.rs     # Template loading and caching system
└── template_renderers.rs  # Template rendering functions
```

## Core Application (`main.rs`)

### Dependencies
```rust
use actix_files as fs;
use actix_web::{web, App, HttpServer};
use std::collections::HashMap;
use std::sync::Mutex;
```

### Application State
```rust
// Battle state storage - thread-safe HashMap with session-based keys
type BattleStateData = web::Data<Mutex<HashMap<String, BattleState>>>;

// Predefined commands loaded at startup
let commands = commands::initialize_commands();
```

### Server Configuration
- **Bind Address:** `0.0.0.0:8080`
- **Static Files:** `/static` → `./static`
- **Image Directory:** `./images`

### Route Configuration
```rust
App::new()
    .app_data(web::Data::new(commands.clone()))
    .app_data(battle_states.clone())
    // Static file serving
    .service(fs::Files::new("/static", "./static").show_files_listing())
    // Page routes
    .route("/", web::get().to(handlers::index))
    .route("/images", web::get().to(image_handlers::image_browser))
    // API routes
    .route("/api/config", web::get().to(handlers::read_config))
    .route("/execute", web::post().to(handlers::execute_command))
```

## Data Models (`models.rs`)

### Command Execution
```rust
#[derive(Deserialize)]
pub struct CommandRequest {
    pub command: String,
    pub args: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct CommandResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}
```

### Predefined Commands
```rust
#[derive(Clone)]
pub struct PredefinedCommand {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
}
```

### AI Image Generation
```rust
#[derive(Serialize, Deserialize)]
pub struct ApiConfig {
    pub api_key: Option<String>,
    pub endpoint: String,
}

impl Default for ApiConfig {
    fn default() -> Self {
        Self {
            api_key: None,
            endpoint: "https://api.stability.ai/v2beta/stable-image/generate/ultra".to_string(),
        }
    }
}
```

## Core Handlers (`handlers.rs`)

### Command Execution Logic
```rust
pub async fn execute_command(req: web::Json<CommandRequest>) -> impl Responder {
    let command_req = req.into_inner();
    
    // Create command object
    let mut cmd = Command::new(&command_req.command);
    
    // Add arguments if provided
    if let Some(args) = command_req.args {
        cmd.args(&args);
    }
    
    // Execute and capture output
    let output = match cmd.output() {
        Ok(output) => {
            CommandResult {
                success: output.status.success(),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code: output.status.code(),
            }
        },
        Err(e) => {
            CommandResult {
                success: false,
                stdout: String::new(),
                stderr: format!("Failed to execute command: {}", e),
                exit_code: None,
            }
        }
    };
    
    HttpResponse::Ok().json(output)
}
```

### Configuration File Reading
```rust
pub async fn read_config(req: web::Query<ConfigRequest>) -> impl Responder {
    let config_path = &req.path;
    let fs_path = Path::new(config_path);
    
    // Validate path existence
    if !fs_path.exists() || !fs_path.is_file() {
        return HttpResponse::NotFound().json(serde_json::json!({
            "error": "Config file not found",
            "path": config_path
        }));
    }
    
    // Read and parse JSON
    match fs::read_to_string(fs_path) {
        Ok(contents) => {
            match serde_json::from_str::<Value>(&contents) {
                Ok(json) => HttpResponse::Ok().json(json),
                Err(e) => HttpResponse::BadRequest().json(serde_json::json!({
                    "error": format!("Failed to parse JSON: {}", e)
                }))
            }
        },
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to read file: {}", e)
        }))
    }
}
```

## Battle Tracker (`battle_handlers.rs`)

### Data Structures
```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct Combatant {
    pub id: String,
    pub name: String,
    pub initiative: i32,
    pub hp: i32,
    pub max_hp: i32,
    pub ac: i32,
    pub combatant_type: String,  // player, enemy, ally
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct BattleState {
    pub combatants: Vec<Combatant>,
    pub current_turn: i32,
    pub round: i32,
    pub active_combatant_id: Option<String>,
    pub notes: Option<String>,
    pub combatant_text: Option<String>,
}
```

### State Management
```rust
// Shared state type definition
type BattleStateData = web::Data<Mutex<HashMap<String, BattleState>>>;

// Save state with session ID
pub async fn save_battle_state(
    req: web::Json<SaveBattleRequest>,
    battle_states: BattleStateData,
) -> impl Responder {
    let mut states = battle_states.lock().unwrap();
    states.insert(req.session_id.clone(), req.state.clone());
    
    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Battle state saved successfully"
    }))
}
```

### Session-Based Retrieval
```rust
pub async fn get_battle_state(
    req: web::Query<GetBattleRequest>,
    battle_states: BattleStateData,
) -> impl Responder {
    let states = battle_states.lock().unwrap();
    
    if let Some(state) = states.get(&req.session_id) {
        HttpResponse::Ok().json(state)
    } else {
        // Return empty state if not found
        HttpResponse::Ok().json(BattleState::default())
    }
}
```

## Media Handling (`image_handlers.rs`)

### Constants
```rust
pub const MEDIA_BASE_DIR: &str = "../DnD_Images";
pub const BATTLEMAP_BASE_DIR: &str = "/media/jp19060/Expansion/content";
```

### Directory Listing Logic
```rust
pub async fn list_directory(req: web::Query<DirectoryRequest>) -> impl Responder {
    let directory_path = &req.path;
    let fs_path = PathBuf::from(directory_path);
    
    // Validate directory
    if !fs_path.exists() || !fs_path.is_dir() {
        return HttpResponse::NotFound().json(serde_json::json!({
            "error": "Path not found or not a directory"
        }));
    }
    
    // Read directory contents
    match fs::read_dir(&fs_path) {
        Ok(entries) => {
            let mut items = Vec::new();
            
            // Add parent directory navigation
            if let Some(parent) = fs_path.parent().map(|p| p.to_string_lossy().to_string()) {
                items.push(FolderItem {
                    name: "..".to_string(),
                    path: parent,
                    is_dir: true,
                    file_type: "directory".to_string(),
                });
            }
            
            // Process entries with file type filtering
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    let is_dir = path.is_dir();
                    
                    // Filter files by extension
                    if !is_dir {
                        if let Some(ext) = path.extension() {
                            let ext_str = ext.to_string_lossy().to_lowercase();
                            let valid_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "json", 
                                            "mp4", "webm", "ogg", "mov", "avi", "mkv", "flv"];
                            
                            if !valid_exts.contains(&ext_str.as_str()) {
                                continue;
                            }
                        } else {
                            continue;
                        }
                    }
                    
                    // Add to items list
                    items.push(FolderItem {
                        name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                        path: path.to_string_lossy().to_string(),
                        is_dir,
                        file_type: determine_file_type(&path),
                    });
                }
            }
            
            // Sort: directories first, then alphabetically
            items.sort_by(|a, b| {
                if a.name == ".." { return std::cmp::Ordering::Less; }
                if b.name == ".." { return std::cmp::Ordering::Greater; }
                
                match (a.is_dir, b.is_dir) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            });
            
            HttpResponse::Ok().json(ListResponse {
                items,
                current_path: directory_path.clone(),
            })
        },
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to read directory: {}", e)
        }))
    }
}
```

### Media Serving with MIME Types
```rust
pub async fn serve_media(req: web::Query<DirectoryRequest>) -> impl Responder {
    let fs_path = PathBuf::from(&req.path);
    
    if !fs_path.exists() || !fs_path.is_file() {
        return HttpResponse::NotFound().body("File not found");
    }
    
    match fs::read(&fs_path) {
        Ok(file_bytes) => {
            // MIME type detection based on file extension
            let content_type = match fs_path.extension().and_then(|e| e.to_str()) {
                // Images
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("png") => "image/png",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                Some("bmp") => "image/bmp",
                // Videos
                Some("mp4") => "video/mp4",
                Some("webm") => "video/webm",
                Some("ogg") => "video/ogg",
                Some("mov") => "video/quicktime",
                Some("avi") => "video/x-msvideo",
                Some("mkv") => "video/x-matroska",
                Some("flv") => "video/x-flv",
                _ => "application/octet-stream",
            };
            
            HttpResponse::Ok()
                .content_type(content_type)
                .body(file_bytes)
        },
        Err(e) => HttpResponse::InternalServerError().body(format!("Failed to read file: {}", e))
    }
}
```

## AI Image Generation (`image_gen_handlers.rs`)

### Constants and Configuration
```rust
const GENERATED_IMAGES_DIR: &str = "./storage/ai_images";
```

### Image Generation Pipeline
```rust
pub async fn generate_image(req: web::Json<GenerateImageRequest>) -> impl Responder {
    // Ensure storage directory exists
    if !Path::new(GENERATED_IMAGES_DIR).exists() {
        fs::create_dir_all(GENERATED_IMAGES_DIR)?;
    }
    
    // Generate unique filename
    let filename = format!("{}.{}", Uuid::new_v4(), req.output_format);
    let file_path = format!("{}/{}", GENERATED_IMAGES_DIR, filename);
    
    // Configure HTTP client
    let client = Client::new();
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::AUTHORIZATION, 
        header::HeaderValue::from_str(&format!("Bearer {}", req.api_key))?
    );
    headers.insert(header::ACCEPT, header::HeaderValue::from_static("image/*"));
    
    // Build multipart form payload
    let payload = serde_json::json!({
        "prompt": req.prompt,
        "output_format": req.output_format,
        "aspect_ratio": "16:9"
    });
    
    let mut form = reqwest::multipart::Form::new();
    if let Some(obj) = payload.as_object() {
        for (key, value) in obj {
            form = form.text(key.clone(), value.to_string());
        }
    }
    
    // Send request and handle response
    match client.post(&req.endpoint).headers(headers).multipart(form).send().await {
        Ok(response) if response.status().is_success() => {
            // Save binary response to file
            let bytes = response.bytes().await?;
            let mut file = fs::File::create(&file_path)?;
            file.write_all(&bytes)?;
            
            // Return success response with viewing URL
            HttpResponse::Ok().json(GenerateImageResponse {
                success: true,
                message: "Image generated successfully".to_string(),
                image_path: Some(file_path),
                image_url: Some(format!("/api/image-gen/view?path={}", filename)),
            })
        },
        Ok(response) => {
            // Handle API errors
            let error_text = response.text().await.unwrap_or_default();
            HttpResponse::BadRequest().json(GenerateImageResponse {
                success: false,
                message: format!("API Error: {}", error_text),
                image_path: None,
                image_url: None,
            })
        },
        Err(e) => {
            HttpResponse::InternalServerError().json(GenerateImageResponse {
                success: false,
                message: format!("Request failed: {}", e),
                image_path: None,
                image_url: None,
            })
        }
    }
}
```

### Credit Monitoring
```rust
pub async fn check_credits(req: web::Json<CheckCreditsRequest>) -> impl Responder {
    let client = Client::new();
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::AUTHORIZATION, 
        header::HeaderValue::from_str(&format!("Bearer {}", req.api_key))?
    );
    
    // Query Stability AI balance endpoint
    match client.get("https://api.stability.ai/v1/user/balance").headers(headers).send().await {
        Ok(response) if response.status().is_success() => {
            let balance_data: serde_json::Value = response.json().await?;
            
            if let Some(credits) = balance_data.get("credits").and_then(|c| c.as_f64()) {
                HttpResponse::Ok().json(CheckCreditsResponse {
                    success: true,
                    message: "Successfully retrieved credits".to_string(),
                    credits: Some(credits),
                })
            } else {
                HttpResponse::Ok().json(CheckCreditsResponse {
                    success: false,
                    message: "Could not find credits in response".to_string(),
                    credits: None,
                })
            }
        },
        Ok(response) => {
            let error_text = response.text().await.unwrap_or_default();
            HttpResponse::BadRequest().json(CheckCreditsResponse {
                success: false,
                message: format!("API Error ({}): {}", response.status().as_u16(), error_text),
                credits: None,
            })
        },
        Err(e) => {
            HttpResponse::InternalServerError().json(CheckCreditsResponse {
                success: false,
                message: format!("Failed to send request: {}", e),
                credits: None,
            })
        }
    }
}
```

## File Upload System (`upload_handlers.rs`)

### Configuration
```rust
pub const UPLOAD_DIR: &str = "images";
pub const UPLOAD_OVERLAY_DIR: &str = "overlays";
```

### Upload Handler Implementation
```rust
pub async fn upload_image(mut payload: actix_web::web::Payload) -> Result<HttpResponse, Error> {
    // Ensure directory exists
    ensure_upload_directory(UPLOAD_DIR)?;
    
    // Generate unique filename
    let uuid = Uuid::new_v4();
    let filename = format!("{}.png", uuid);
    let filepath = format!("{}/{}", UPLOAD_DIR, filename);
    
    // Create file for writing
    let mut file = std::fs::File::create(&filepath)?;
    
    // Stream payload to file
    let mut bytes = web::BytesMut::new();
    while let Some(item) = payload.next().await {
        let item = item?;
        bytes.extend_from_slice(&item);
    }
    
    file.write_all(&bytes)?;
    
    // Return response with file path
    Ok(HttpResponse::Ok().json(ImageUploadResponse {
        success: true,
        message: "Image uploaded successfully".to_string(),
        path: Some(format!("{}/{}", UPLOAD_DIR, filename)),
        width: Some(800),   // Mock dimensions
        height: Some(600),  // Mock dimensions
    }))
}
```

## Template System (`template_loader.rs`)

### Template Loader Implementation
```rust
pub struct TemplateLoader {
    templates: HashMap<String, String>,
}

impl TemplateLoader {
    pub fn new() -> io::Result<Self> {
        let mut templates = HashMap::new();
        
        // Load templates with fallback to embedded content
        templates.insert("base".to_string(), load_template("src/static/templates/base.html")?);
        templates.insert("command_center".to_string(), load_template("src/static/templates/command_center.html")?);
        // ... other templates
        
        Ok(Self { templates })
    }
    
    pub fn render(&self, template_name: &str, context: HashMap<String, String>) -> String {
        let mut result = self.templates.get(template_name)
            .unwrap_or_else(|| panic!("Template not found: {}", template_name))
            .clone();
        
        // Variable substitution using {{variable}} syntax
        for (key, value) in context {
            result = result.replace(&format!("{{{{{}}}}}", key), &value);
        }
        
        result
    }
    
    pub fn render_with_base(&self, template_name: &str, context: HashMap<String, String>, title: &str, active_page: &str) -> String {
        // Render content template first
        let content = self.render(template_name, context);
        
        // Build base template context
        let mut base_context = HashMap::new();
        base_context.insert("title".to_string(), title.to_string());
        base_context.insert("content".to_string(), content);
        
        // Set navigation active states
        base_context.insert("home_active".to_string(), 
            if active_page == "home" { "active".to_string() } else { "".to_string() });
        // ... other navigation states
        
        // Add page-specific scripts
        let page_script = match active_page {
            "images" => r#"<script src="/static/js/image-browser.js"></script>"#,
            "battle" => r#"<script src="/static/js/battle/battle-main.js"></script>"#,
            // ... other page scripts
            _ => "",
        };
        base_context.insert("page_script".to_string(), page_script.to_string());
        
        self.render("base", base_context)
    }
}
```

### Template Loading with Fallback
```rust
fn load_template(path: &str) -> io::Result<String> {
    if Path::new(path).exists() {
        fs::read_to_string(path)
    } else {
        // Fallback to embedded content using include_str! macro
        match path {
            "src/static/templates/base.html" => Ok(include_str!("templates/base.html").to_string()),
            "src/static/templates/command_center.html" => Ok(include_str!("templates/command_center.html").to_string()),
            // ... other template fallbacks
            _ => Err(io::Error::new(io::ErrorKind::NotFound, format!("Template not found: {}", path))),
        }
    }
}
```

## Predefined Commands (`commands.rs`)

### Command Initialization
```rust
pub fn initialize_commands() -> HashMap<String, PredefinedCommand> {
    let mut commands = HashMap::new();

    // VTT control commands
    commands.insert("stop-vtt".to_string(), PredefinedCommand {
        name: "VTT OBS".to_string(),
        command: "bash".to_string(),
        args: vec![
            "-c".to_string(),
            "pkill -f ./python-env/bin/python || echo 'VTT is not currently running'".to_string(),
        ],
    });

    commands.insert("vtt-status".to_string(), PredefinedCommand {
        name: "VTT Status".to_string(),
        command: "bash".to_string(),
        args: vec![
            "-c".to_string(),
            "COUNT=$(pgrep -f ./python-env/bin/python | wc -l); if [ $COUNT -gt 0 ]; then echo \"$COUNT VTT instance(s) running:\"; ps aux | grep obs | grep -v grep; else echo 'OBS is not running'; fi".to_string(),
        ]
    });

    // Display management commands
    commands.insert("list-monitors".to_string(), PredefinedCommand {
        name: "List Available Monitors".to_string(),
        command: "bash".to_string(),
        args: vec![
            "-c".to_string(),
            "xrandr | grep ' connected' | awk '{print NR-1 \": \" $1 \" - \" $3}'".to_string(),
        ],
    });

    // Screen launching commands
    commands.insert("start-battlemap-screen".to_string(), PredefinedCommand {
        name: "Start Battle".to_string(),
        command: "bash".to_string(),
        args: vec![
            "-c".to_string(),
            "./python-env/bin/python ./ScryingGlass/display_engine.py ./storage/scrying_glasses/battlemap.json".to_string(),
        ],
    });

    commands
}
```

## JSON File Operations (`json_handlers.rs`)

### JSON File Reading
```rust
pub async fn read_json(query: web::Query<ReadParams>) -> impl Responder {
    let file_path = &query.path;
    
    // Validate file existence
    if !Path::new(file_path).exists() {
        return HttpResponse::NotFound().body(format!("File not found: {}", file_path));
    }
    
    // Read and validate JSON
    match fs::read_to_string(file_path) {
        Ok(content) => {
            match serde_json::from_str::<serde_json::Value>(&content) {
                Ok(json_value) => HttpResponse::Ok().json(json_value),
                Err(e) => HttpResponse::BadRequest().body(format!("Invalid JSON format: {}", e)),
            }
        },
        Err(e) => HttpResponse::InternalServerError().body(format!("Failed to read file: {}", e)),
    }
}
```

### JSON File Writing
```rust
pub async fn save_json(json: web::Json<SaveParams>) -> impl Responder {
    let file_path = &json.path;
    let content = &json.content;
    
    // Validate JSON before writing
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(_) => {
            match fs::write(file_path, content) {
                Ok(_) => HttpResponse::Ok().body("File saved successfully"),
                Err(e) => HttpResponse::InternalServerError().body(format!("Failed to save file: {}", e)),
            }
        },
        Err(e) => HttpResponse::BadRequest().body(format!("Invalid JSON format: {}", e)),
    }
}
```

## WiFi & Hotspot Management (`handlers.rs`)

> **Note:** For comprehensive WiFi/hotspot documentation including configuration, troubleshooting, and API details, see [WiFi & Hotspot Management Feature Guide](wifi_hotspot_feature.md).

### WiFi Configuration
```rust
#[derive(Deserialize, Clone)]
struct WifiConfig {
    client_interface: String,    // Interface for internet connection (e.g., wlan0)
    hotspot_interface: String,   // Interface for hosting access point (e.g., wlan1)
    hotspot_ssid: String,        // Hotspot network name
    hotspot_password: String,    // WPA2 password
}

// Loaded at startup from storage/wifi_config.json
lazy_static! {
    static ref WIFI_CONFIG: WifiConfig = load_wifi_config();
}
```

### Network Scanning (`handlers.rs:253`)
```rust
pub async fn wifi_scan() -> impl Responder {
    // Uses nmcli in terse mode for reliable SSID parsing
    // Format: IN-USE:SSID:SIGNAL:SECURITY
    let output = Command::new("nmcli")
        .args(["-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY",
               "device", "wifi", "list", "ifname", &WIFI_CONFIG.client_interface])
        .output();

    // Parses output, filters hotspot SSID, sorts by signal strength
    let networks = parse_nmcli_networks(&stdout);
}
```

**Key Features:**
- Terse mode parsing handles multi-word SSIDs correctly (e.g., "John's room")
- Filters hotspot SSID from scan results
- Returns networks sorted by signal strength

### Network Connection (`handlers.rs:545`)
```rust
pub async fn wifi_connect(req: web::Json<ConnectRequest>) -> impl Responder {
    // Connects to network using NetworkManager
    Command::new("nmcli")
        .args(["device", "wifi", "connect", &req.ssid,
               "password", &req.password, "ifname", &WIFI_CONFIG.client_interface])
        .output();
}
```

### Current Connection Status (`handlers.rs:303`)
```rust
pub async fn wifi_current_connection() -> impl Responder {
    // Get active connection details
    // Returns: SSID, signal strength, IP address, gateway
    Command::new("nmcli")
        .args(["-t", "-f", "GENERAL.CONNECTION,IP4.ADDRESS,IP4.GATEWAY",
               "device", "show", &WIFI_CONFIG.client_interface])
        .output();
}
```

### Hotspot Control (`handlers.rs:632`)
```rust
pub async fn wifi_hotspot_toggle(req: web::Json<HotspotToggleRequest>) -> impl Responder {
    if req.enable {
        // Start hotspot via systemd service
        Command::new("sudo")
            .args(["-n", "systemctl", "start", "screensage-hotspot"])
            .output();
    } else {
        // Stop hotspot
        Command::new("sudo")
            .args(["-n", "systemctl", "stop", "screensage-hotspot"])
            .output();
    }
}
```

**Requirements:**
- Sudoers configuration for passwordless systemctl (see [WiFi Feature Guide](wifi_hotspot_feature.md#sudoers-access))
- Hotspot systemd service installed

### Connected Clients Detection (`handlers.rs:422`)
```rust
pub async fn wifi_clients() -> impl Responder {
    // Use 'iw' to get actual associated stations
    let output = Command::new("iw")
        .args(["dev", &WIFI_CONFIG.hotspot_interface, "station", "dump"])
        .output();

    // Parse station dump and cross-reference with ARP table for IPs
    let clients = parse_iw_stations(&stdout);
}
```

**Implementation Details:**
- Uses `iw station dump` for actual WiFi associations (not ARP table)
- Cross-references MAC addresses with ARP for IP assignment
- Returns: IP address, MAC address, hostname (when available)

### Hotspot Status (`handlers.rs:447`)
```rust
pub async fn wifi_hotspot_status() -> impl Responder {
    // Check if systemd service is active
    let output = Command::new("systemctl")
        .args(["is-active", "screensage-hotspot"])
        .output();

    // Returns: active status, SSID, password, IP address
}
```

### API Endpoints

**WiFi Management:**
- `GET /wifi` - Render WiFi management page
- `GET /api/wifi/scan` - Get available networks
- `GET /api/wifi/current` - Get current connection
- `GET /api/wifi/known` - List known networks
- `POST /api/wifi/connect` - Connect to network

**Hotspot Management:**
- `GET /api/wifi/hotspot/status` - Get hotspot state
- `POST /api/wifi/hotspot/toggle` - Enable/disable hotspot
- `GET /api/wifi/clients` - Get connected devices

For detailed API examples and responses, see [WiFi Feature Guide - API Endpoints](wifi_hotspot_feature.md#api-endpoints).

## Error Handling Patterns

### Common Error Response Structure
```rust
// Standard error response
HttpResponse::NotFound().json(serde_json::json!({
    "error": "Resource not found",
    "path": requested_path
}))

// Validation error
HttpResponse::BadRequest().json(serde_json::json!({
    "error": format!("Invalid input: {}", validation_error)
}))

// Internal server error
HttpResponse::InternalServerError().json(serde_json::json!({
    "error": format!("Operation failed: {}", error_details)
}))
```

### File System Error Handling
```rust
// Path validation pattern
if !fs_path.exists() || !fs_path.is_file() {
    return HttpResponse::NotFound().body("File not found");
}

// File operation error handling
match fs::read(&fs_path) {
    Ok(file_bytes) => {
        // Success path
        HttpResponse::Ok().content_type(content_type).body(file_bytes)
    },
    Err(e) => {
        println!("Error reading file: {}", e);
        HttpResponse::InternalServerError().body(format!("Failed to read file: {}", e))
    }
}
```

## Thread Safety and State Management

### Battle State Concurrency
```rust
// Thread-safe state storage using Mutex
type BattleStateData = web::Data<Mutex<HashMap<String, BattleState>>>;

// Safe state access pattern
let mut states = battle_states.lock().unwrap();
states.insert(session_id, battle_state);
```

### Shared Configuration
```rust
// Immutable shared data for commands
.app_data(web::Data::new(commands.clone()))

// Access in handlers
pub async fn execute_predefined(
    path: web::Path<String>,
    commands: web::Data<HashMap<String, PredefinedCommand>>
) -> impl Responder {
    if let Some(cmd_config) = commands.get(&command_id) {
        // Execute command
    }
}
```