use actix_web::{web, HttpResponse, Responder};
use std::collections::HashMap;
use std::process::Command;
use serde_json::Value;
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

use crate::models::{CommandRequest, CommandResult, PredefinedCommand};

#[derive(serde::Deserialize)]
pub struct ConfigRequest {
    path: String,
}

#[derive(serde::Deserialize)]
pub struct CommandParams {
    screen: Option<String>,
}

pub async fn index() -> impl Responder {
    let html = crate::template_renderers::render_command_center();

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

pub async fn upload() -> impl Responder {
    let html = crate::template_renderers::render_upload();

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

/// Health check endpoint
pub async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("Server is running")
}

/// Execute a command from JSON request
pub async fn execute_command(req: web::Json<CommandRequest>) -> impl Responder {
    let command_req = req.into_inner();
    println!("Executing command: {} with args: {:?}", command_req.command, command_req.args);
    
    // Create command object
    let mut cmd = Command::new(&command_req.command);
    
    // Add arguments if provided
    if let Some(args) = command_req.args {
        cmd.args(&args);
    }
    
    // Execute the command
    let output = match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            
            CommandResult {
                success: output.status.success(),
                stdout,
                stderr,
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

/// Execute a predefined command by ID
pub async fn execute_predefined(
    path: web::Path<String>,
    query: web::Query<CommandParams>,
    commands: web::Data<HashMap<String, PredefinedCommand>>
) -> impl Responder {
    let command_id = path.into_inner();

    if let Some(cmd_config) = commands.get(&command_id) {
        println!("Executing predefined command: {}", cmd_config.name);

        let mut cmd = Command::new(&cmd_config.command);

        // Handle screen parameter for display commands
        if let Some(screen_num) = &query.screen {
            // For start-display-screen and start-battlemap-screen commands,
            // modify the command args to include the monitor parameter
            if command_id == "start-display-screen" || command_id == "start-battlemap-screen" {
                // Replace the monitor number in the JSON config path
                let modified_args: Vec<String> = cmd_config.args.iter().map(|arg| {
                    // For the Python command, add the --monitor flag
                    if arg.contains("display_engine_pyglet.py") {
                        format!("{} --monitor {}", arg, screen_num)
                    } else {
                        arg.clone()
                    }
                }).collect();

                cmd.args(&modified_args);
                println!("  Using monitor: {}", screen_num);
            } else {
                cmd.args(&cmd_config.args);
            }
        } else {
            cmd.args(&cmd_config.args);
        }

        let output = match cmd.output() {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                
                CommandResult {
                    success: output.status.success(),
                    stdout,
                    stderr,
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
    } else {
        HttpResponse::NotFound().body(format!("Command '{}' not found", command_id))
    }
}

/// Read a config file and return its contents as JSON
pub async fn read_config(req: web::Query<ConfigRequest>) -> impl Responder {
    let config_path = &req.path;
    
    println!("Executing predefined reading config file: {}", config_path);
    
    // Create a PathBuf from the provided path
    let fs_path = Path::new(config_path);
    
    // Check if the path exists and is a file
    if !fs_path.exists() || !fs_path.is_file() {
        return HttpResponse::NotFound().json(serde_json::json!({
            "error": "Config file not found",
            "path": config_path
        }));
    }
    
    // Read the file
    match fs::read_to_string(fs_path) {
        Ok(contents) => {
            // Parse the JSON
            match serde_json::from_str::<Value>(&contents) {
                Ok(json) => HttpResponse::Ok().json(json),
                Err(e) => {
                    println!("Error parsing JSON: {}", e);
                    HttpResponse::BadRequest().json(serde_json::json!({
                        "error": format!("Failed to parse JSON: {}", e),
                        "path": config_path
                    }))
                }
            }
        },
        Err(e) => {
            println!("Error reading file: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to read file: {}", e),
                "path": config_path
            }))
        }
    }
}

// WiFi Management Handlers

#[derive(Deserialize, Clone)]
struct WifiConfig {
    client_interface: String,
    hotspot_interface: String,
    hotspot_ssid: String,
    hotspot_password: String,
}

lazy_static::lazy_static! {
    static ref WIFI_CONFIG: WifiConfig = load_wifi_config();
    static ref USING_IWD: bool = is_using_iwd();
}

fn is_using_iwd() -> bool {
    // Check if iwd service is active
    let output = Command::new("systemctl")
        .args(["is-active", "iwd"])
        .output();

    if let Ok(output) = output {
        let status = String::from_utf8_lossy(&output.stdout);
        status.trim() == "active"
    } else {
        false
    }
}

fn load_wifi_config() -> WifiConfig {
    let config_path = "storage/wifi_config.json";

    match fs::read_to_string(config_path) {
        Ok(contents) => {
            match serde_json::from_str(&contents) {
                Ok(config) => config,
                Err(e) => {
                    eprintln!("Failed to parse wifi config: {}. Using defaults.", e);
                    WifiConfig {
                        client_interface: "wlan1".to_string(),
                        hotspot_interface: "wlan0".to_string(),
                        hotspot_ssid: "ScreenSage".to_string(),
                        hotspot_password: "DnDepaper".to_string(),
                    }
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to load wifi config from {}: {}. Using defaults.", config_path, e);
            WifiConfig {
                client_interface: "wlan1".to_string(),
                hotspot_interface: "wlan0".to_string(),
                hotspot_ssid: "ScreenSage".to_string(),
                hotspot_password: "DnDepaper".to_string(),
            }
        }
    }
}

#[derive(Serialize)]
struct WifiNetwork {
    ssid: String,
    signal: u8,
    security: String,
    connected: bool,
}

#[derive(Serialize)]
struct KnownNetwork {
    name: String,
    uuid: String,
}

#[derive(Serialize)]
struct WifiClient {
    ip: String,
    mac: String,
    hostname: Option<String>,
}

#[derive(Deserialize)]
pub struct ConnectRequest {
    pub ssid: String,
    pub password: String,
}

pub async fn wifi() -> impl Responder {
    let html = crate::template_renderers::render_wifi();

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

pub async fn wifi_scan() -> impl Responder {
    if *USING_IWD {
        // Use iwctl for iwd
        let output = Command::new("iwctl")
            .args(["station", &WIFI_CONFIG.client_interface, "get-networks"])
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let networks = parse_iwctl_networks(&stdout);

                HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "networks": networks
                }))
            }
            Err(e) => {
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "error": format!("Failed to scan networks: {}", e)
                }))
            }
        }
    } else {
        // Use nmcli in terse mode for proper SSID parsing
        let output = Command::new("nmcli")
            .args(["-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "device", "wifi", "list", "ifname", &WIFI_CONFIG.client_interface])
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let networks = parse_nmcli_networks(&stdout);

                HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "networks": networks
                }))
            }
            Err(e) => {
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "error": format!("Failed to scan networks: {}", e)
                }))
            }
        }
    }
}

pub async fn wifi_current_connection() -> impl Responder {
    if *USING_IWD {
        // Use iwctl for iwd
        let output = Command::new("iwctl")
            .args(["station", &WIFI_CONFIG.client_interface, "show"])
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                parse_iwctl_station_info(&stdout)
            }
            Err(e) => {
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "error": format!("Failed to get connection status: {}", e)
                }))
            }
        }
    } else {
        // Use nmcli for NetworkManager
        let output = Command::new("nmcli")
            .args(["-t", "-f", "NAME,TYPE,DEVICE", "connection", "show", "--active"])
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);

                // Find active WiFi connection on client interface
                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split(':').collect();
                    if parts.len() >= 3 {
                        let name = parts[0];
                        let conn_type = parts[1];
                        let device = parts[2];

                        // Check if it's a WiFi connection on the client interface
                        // AND make sure it's not the hotspot
                        if (conn_type.contains("wireless") || conn_type.contains("wifi"))
                            && device == WIFI_CONFIG.client_interface
                            && name != WIFI_CONFIG.hotspot_ssid {

                            // Get detailed connection info
                            let detail_output = Command::new("nmcli")
                                .args(["-t", "-f", "IP4.ADDRESS,IP4.GATEWAY,IP4.DNS", "device", "show", &WIFI_CONFIG.client_interface])
                                .output();

                            let mut ip_address = String::from("N/A");
                            let mut gateway = String::from("N/A");
                            let mut dns = String::from("N/A");

                            if let Ok(detail_out) = detail_output {
                                let detail_stdout = String::from_utf8_lossy(&detail_out.stdout);
                                for detail_line in detail_stdout.lines() {
                                    if detail_line.starts_with("IP4.ADDRESS") {
                                        let parts: Vec<&str> = detail_line.split(':').collect();
                                        if parts.len() >= 2 {
                                            ip_address = parts[1].to_string();
                                        }
                                    }
                                    if detail_line.starts_with("IP4.GATEWAY") {
                                        let parts: Vec<&str> = detail_line.split(':').collect();
                                        if parts.len() >= 2 {
                                            gateway = parts[1].to_string();
                                        }
                                    }
                                    if detail_line.starts_with("IP4.DNS") {
                                        let parts: Vec<&str> = detail_line.split(':').collect();
                                        if parts.len() >= 2 {
                                            dns = parts[1].to_string();
                                        }
                                    }
                                }
                            }

                            // Get signal strength from wifi list
                            let wifi_output = Command::new("nmcli")
                                .args(["device", "wifi", "list", "ifname", &WIFI_CONFIG.client_interface])
                                .output();

                            let mut signal = 0u8;
                            if let Ok(wifi_out) = wifi_output {
                                let wifi_stdout = String::from_utf8_lossy(&wifi_out.stdout);
                                let networks = parse_nmcli_networks(&wifi_stdout);
                                if let Some(connected_network) = networks.iter().find(|n| n.connected) {
                                    signal = connected_network.signal;
                                }
                            }

                            return HttpResponse::Ok().json(serde_json::json!({
                                "success": true,
                                "connected": true,
                                "ssid": name,
                                "signal": signal,
                                "ip_address": ip_address,
                                "gateway": gateway,
                                "dns": dns
                            }));
                        }
                    }
                }

                // No active WiFi connection found
                HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "connected": false
                }))
            }
            Err(e) => {
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "error": format!("Failed to get connection status: {}", e)
                }))
            }
        }
    }
}

pub async fn wifi_clients() -> impl Responder {
    // Use 'iw' to get actual associated stations on the hotspot interface
    let output = Command::new("iw")
        .args(["dev", &WIFI_CONFIG.hotspot_interface, "station", "dump"])
        .output();

    match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let clients = parse_iw_stations(&stdout);

            HttpResponse::Ok().json(serde_json::json!({
                "success": true,
                "clients": clients
            }))
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": format!("Failed to get clients: {}", e)
            }))
        }
    }
}

pub async fn wifi_hotspot_status() -> impl Responder {
    // Check if screensage-hotspot systemd service is active
    let output = Command::new("systemctl")
        .args(["is-active", "screensage-hotspot"])
        .output();

    match output {
        Ok(output) => {
            // systemctl is-active returns exit code 0 if service is active
            let active = output.status.success();

            let response = if active {
                // Check if internet sharing is enabled
                let sharing_check = Command::new("iptables")
                    .args(["-t", "nat", "-C", "POSTROUTING", "-o", &WIFI_CONFIG.client_interface, "-j", "MASQUERADE"])
                    .output();

                let sharing_enabled = sharing_check.map(|o| o.status.success()).unwrap_or(false);

                // Check if client interface has internet
                let route_check = Command::new("ip")
                    .args(["route", "show", "default", "dev", &WIFI_CONFIG.client_interface])
                    .output();

                let has_internet = route_check
                    .map(|o| o.status.success() && !o.stdout.is_empty())
                    .unwrap_or(false);

                // Hotspot is running - return full details
                serde_json::json!({
                    "success": true,
                    "active": true,
                    "ssid": WIFI_CONFIG.hotspot_ssid.clone(),
                    "password": WIFI_CONFIG.hotspot_password.clone(),
                    "ip_address": "192.168.12.1",
                    "channel": "36 (5 GHz)",
                    "interface": WIFI_CONFIG.hotspot_interface.clone(),
                    "sharing_enabled": sharing_enabled,
                    "has_internet": has_internet,
                    "client_interface": WIFI_CONFIG.client_interface.clone()
                })
            } else {
                // Hotspot is not running
                serde_json::json!({
                    "success": true,
                    "active": false,
                    "ssid": null,
                    "sharing_enabled": false,
                    "has_internet": false
                })
            };

            HttpResponse::Ok().json(response)
        }
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": format!("Failed to get hotspot status: {}", e)
            }))
        }
    }
}

pub async fn wifi_known_networks() -> impl Responder {
    if *USING_IWD {
        // Use iwd - read known networks from /var/lib/iwd/
        let known_networks = get_iwd_known_networks();

        HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "networks": known_networks
        }))
    } else {
        // Use NetworkManager
        let output = Command::new("nmcli")
            .args(["connection", "show"])
            .output();

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let known_networks = parse_known_networks(&stdout);

                HttpResponse::Ok().json(serde_json::json!({
                    "success": true,
                    "networks": known_networks
                }))
            }
            Err(e) => {
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "error": format!("Failed to get known networks: {}", e)
                }))
            }
        }
    }
}

pub async fn wifi_connect(req: web::Json<ConnectRequest>) -> impl Responder {
    let connect_req = req.into_inner();

    println!("Attempting to connect to network: {}", connect_req.ssid);

    if *USING_IWD {
        // Use iwctl for iwd
        let mut cmd = Command::new("iwctl");
        cmd.args(["station", &WIFI_CONFIG.client_interface, "connect", &connect_req.ssid]);

        if !connect_req.password.is_empty() {
            cmd.args(["--passphrase", &connect_req.password]);
        }

        let output = cmd.output();

        match output {
            Ok(output) => {
                if output.status.success() {
                    println!("Successfully connected to {}", connect_req.ssid);
                    HttpResponse::Ok().json(serde_json::json!({
                        "success": true,
                        "message": format!("Connected to {}", connect_req.ssid)
                    }))
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    println!("Failed to connect: {}", stderr);
                    HttpResponse::Ok().json(serde_json::json!({
                        "success": false,
                        "message": "Connection failed. Please check your password and try again."
                    }))
                }
            }
            Err(e) => {
                println!("Error executing iwctl: {}", e);
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to execute connection command: {}", e)
                }))
            }
        }
    } else {
        // Use nmcli for NetworkManager
        let mut cmd = Command::new("nmcli");
        cmd.args(["device", "wifi", "connect", &connect_req.ssid]);

        if !connect_req.password.is_empty() {
            cmd.args(["password", &connect_req.password]);
        }

        cmd.args(["ifname", &WIFI_CONFIG.client_interface]);

        let output = cmd.output();

        match output {
            Ok(output) => {
                if output.status.success() {
                    println!("Successfully connected to {}", connect_req.ssid);
                    HttpResponse::Ok().json(serde_json::json!({
                        "success": true,
                        "message": format!("Connected to {}", connect_req.ssid)
                    }))
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    println!("Failed to connect: {}", stderr);
                    HttpResponse::Ok().json(serde_json::json!({
                        "success": false,
                        "message": "Connection failed. Please check your password and try again."
                    }))
                }
            }
            Err(e) => {
                println!("Error executing nmcli: {}", e);
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to execute connection command: {}", e)
                }))
            }
        }
    }
}

#[derive(Deserialize)]
pub struct HotspotToggleRequest {
    pub enable: bool,
}

pub async fn wifi_hotspot_toggle(req: web::Json<HotspotToggleRequest>) -> impl Responder {
    let toggle_req = req.into_inner();

    if toggle_req.enable {
        // Enable hotspot using systemd service
        println!("Enabling hotspot: {}", WIFI_CONFIG.hotspot_ssid);

        let output = Command::new("sudo")
            .args(["-n", "systemctl", "start", "screensage-hotspot"])
            .output();

        match output {
            Ok(output) => {
                if output.status.success() {
                    println!("Hotspot enabled successfully");
                    HttpResponse::Ok().json(serde_json::json!({
                        "success": true,
                        "message": "Hotspot enabled"
                    }))
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    println!("Failed to enable hotspot: {}", stderr);
                    HttpResponse::Ok().json(serde_json::json!({
                        "success": false,
                        "message": format!("Failed to start hotspot: {}", stderr)
                    }))
                }
            }
            Err(e) => {
                println!("Error starting hotspot service: {}", e);
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to start hotspot: {}", e)
                }))
            }
        }
    } else {
        // Disable hotspot using systemd service
        println!("Disabling hotspot");

        let output = Command::new("sudo")
            .args(["-n", "systemctl", "stop", "screensage-hotspot"])
            .output();

        match output {
            Ok(output) => {
                if output.status.success() {
                    println!("Hotspot disabled successfully");
                    HttpResponse::Ok().json(serde_json::json!({
                        "success": true,
                        "message": "Hotspot disabled"
                    }))
                } else {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    println!("Failed to disable hotspot: {}", stderr);
                    HttpResponse::Ok().json(serde_json::json!({
                        "success": false,
                        "message": format!("Failed to stop hotspot: {}", stderr)
                    }))
                }
            }
            Err(e) => {
                println!("Error stopping hotspot service: {}", e);
                HttpResponse::InternalServerError().json(serde_json::json!({
                    "success": false,
                    "message": format!("Failed to stop hotspot: {}", e)
                }))
            }
        }
    }
}

// Helper function to parse nmcli network list output (terse mode)
fn parse_nmcli_networks(output: &str) -> Vec<WifiNetwork> {
    let mut networks = Vec::new();
    let hotspot_ssid = &WIFI_CONFIG.hotspot_ssid;

    for line in output.lines() {
        // Terse mode format: IN-USE:SSID:SIGNAL:SECURITY
        let parts: Vec<&str> = line.split(':').collect();
        if parts.len() < 4 {
            continue;
        }

        let in_use = parts[0];
        let ssid = parts[1].to_string();
        let signal_str = parts[2];
        let security_str = parts[3];

        // Skip if SSID is empty, "--" (hidden), or matches hotspot
        if ssid.is_empty() || ssid == "--" || ssid == *hotspot_ssid {
            continue;
        }

        // Parse signal strength
        let signal = signal_str.parse::<u8>().unwrap_or(0);

        // Skip networks with 0 signal
        if signal == 0 {
            continue;
        }

        // Parse security
        let security = if security_str == "--" || security_str.is_empty() {
            "Open".to_string()
        } else {
            security_str.to_string()
        };

        let connected = in_use == "*";

        networks.push(WifiNetwork {
            ssid,
            signal,
            security,
            connected,
        });
    }

    // Sort networks by signal strength (highest to lowest)
    networks.sort_by(|a, b| b.signal.cmp(&a.signal));

    networks
}

// Helper function to parse iw station dump output
fn parse_iw_stations(output: &str) -> Vec<WifiClient> {
    let mut clients = Vec::new();

    for line in output.lines() {
        // Look for lines starting with "Station"
        if line.starts_with("Station ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                let mac = parts[1].to_string();

                // Try to find IP address from ARP table
                let ip = get_ip_from_mac(&mac).unwrap_or_else(|| "Unknown".to_string());

                // Try to get hostname
                let hostname = if ip != "Unknown" {
                    get_hostname(&ip)
                } else {
                    None
                };

                clients.push(WifiClient {
                    ip,
                    mac,
                    hostname,
                });
            }
        }
    }

    clients
}

// Helper function to get IP address from MAC address using ARP table
fn get_ip_from_mac(mac: &str) -> Option<String> {
    let output = Command::new("ip")
        .args(["neigh", "show"])
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        if line.contains(mac) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if !parts.is_empty() {
                return Some(parts[0].to_string());
            }
        }
    }

    None
}

// Helper function to parse ip neigh output (kept for compatibility)
#[allow(dead_code)]
fn parse_ip_neigh(output: &str) -> Vec<WifiClient> {
    let mut clients = Vec::new();

    for line in output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 5 {
            continue;
        }

        // Format: "192.168.1.100 dev wlan0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
        let ip = parts[0].to_string();

        // Find MAC address (after "lladdr")
        let mac = parts.iter()
            .position(|&s| s == "lladdr")
            .and_then(|idx| parts.get(idx + 1))
            .unwrap_or(&"Unknown")
            .to_string();

        // Try to get hostname via reverse DNS
        let hostname = get_hostname(&ip);

        clients.push(WifiClient {
            ip,
            mac,
            hostname,
        });
    }

    clients
}

// Helper function to get hostname from IP
fn get_hostname(ip: &str) -> Option<String> {
    // Try to get hostname using host command
    let output = Command::new("host")
        .arg(ip)
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse output like "100.1.168.192.in-addr.arpa domain name pointer device-name.local."
    if let Some(line) = stdout.lines().next() {
        if line.contains("domain name pointer") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(hostname) = parts.last() {
                // Remove trailing dot if present
                return Some(hostname.trim_end_matches('.').to_string());
            }
        }
    }

    None
}

// Helper function to parse known networks from nmcli connection show
fn parse_known_networks(output: &str) -> Vec<KnownNetwork> {
    let mut networks = Vec::new();
    let hotspot_ssid = &WIFI_CONFIG.hotspot_ssid;

    for line in output.lines().skip(1) { // Skip header line
        // Split by whitespace, but connection names can have spaces so we need to be careful
        // Format: "NAME                UUID                                  TYPE      DEVICE"
        // We'll use a more robust parsing approach

        // Find the TYPE column which should be "wifi" or "802-11-wireless"
        if !line.contains("wifi") && !line.contains("802-11-wireless") {
            continue;
        }

        // Extract connection name (everything before UUID)
        // UUIDs are always 36 characters in format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }

        // Find UUID (36 character string with dashes)
        let mut name = String::new();
        let mut uuid = String::new();

        for (i, part) in parts.iter().enumerate() {
            if part.len() == 36 && part.matches('-').count() == 4 {
                // This is the UUID
                uuid = part.to_string();
                // Everything before this is the name
                name = parts[0..i].join(" ");
                break;
            }
        }

        // Skip if name is empty or matches the hotspot SSID
        if name.is_empty() || name == *hotspot_ssid {
            continue;
        }

        networks.push(KnownNetwork {
            name,
            uuid,
        });
    }

    // Sort networks alphabetically by name
    networks.sort_by(|a, b| a.name.cmp(&b.name));

    networks
}

// Helper function to parse iwctl network list output
fn parse_iwctl_networks(output: &str) -> Vec<WifiNetwork> {
    let mut networks = Vec::new();

    // Skip header lines and process network entries
    let lines: Vec<&str> = output.lines().collect();
    let mut parsing_networks = false;

    for line in lines {
        // Skip until we find the header separator line
        if line.contains("----------------") {
            parsing_networks = true;
            continue;
        }

        if !parsing_networks {
            continue;
        }

        // Stop at empty lines
        if line.trim().is_empty() {
            break;
        }

        // Strip ANSI escape codes (e.g., [1;90m, [0m)
        let clean_line = strip_ansi_codes(line);

        // Check if this is the connected network (has ">" prefix)
        let connected = clean_line.trim_start().starts_with('>');

        // Remove the ">" prefix if present
        let line_without_marker = if connected {
            clean_line.replacen('>', " ", 1)
        } else {
            clean_line
        };

        // Parse the line: network name (padded ~34 chars), security (~20 chars), signal (asterisks)
        let parts: Vec<&str> = line_without_marker.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        // Network name: all parts before the second-to-last and last parts
        // Last part is signal (asterisks), second-to-last is security type
        let signal_str = parts[parts.len() - 1];
        let security = parts[parts.len() - 2];
        let ssid_parts = &parts[0..parts.len() - 2];
        let ssid = ssid_parts.join(" ");

        // Skip empty SSIDs
        if ssid.trim().is_empty() {
            continue;
        }

        // Convert asterisks to signal percentage
        let asterisk_count = signal_str.chars().filter(|c| *c == '*').count();
        let signal = match asterisk_count {
            1 => 25,
            2 => 50,
            3 => 75,
            4 => 100,
            _ => 0,
        };

        // Skip networks with 0 signal
        if signal == 0 {
            continue;
        }

        // Convert security type to friendly name
        let security_str = match security {
            "psk" => "WPA2/WPA3",
            "open" => "Open",
            _ => security,
        }.to_string();

        networks.push(WifiNetwork {
            ssid,
            signal,
            security: security_str,
            connected,
        });
    }

    // Sort networks by signal strength (highest to lowest)
    networks.sort_by(|a, b| b.signal.cmp(&a.signal));

    networks
}

// Helper function to parse iwctl station show output
fn parse_iwctl_station_info(output: &str) -> HttpResponse {
    let clean_output = strip_ansi_codes(output);

    let mut state = String::new();
    let mut ssid = String::new();
    let mut ip_address = String::from("N/A");
    let mut rssi_dbm: i32 = -100;

    // Parse the output line by line
    for line in clean_output.lines() {
        let trimmed = line.trim();

        if trimmed.contains("State") {
            if let Some(value) = extract_property_value(trimmed) {
                state = value;
            }
        } else if trimmed.contains("Connected network") {
            if let Some(value) = extract_property_value(trimmed) {
                ssid = value;
            }
        } else if trimmed.contains("IPv4 address") {
            if let Some(value) = extract_property_value(trimmed) {
                ip_address = value;
            }
        } else if trimmed.contains("RSSI") && !trimmed.contains("Average") {
            if let Some(value) = extract_property_value(trimmed) {
                // Parse RSSI value (e.g., "-61 dBm")
                if let Some(dbm_str) = value.split_whitespace().next() {
                    if let Ok(dbm) = dbm_str.parse::<i32>() {
                        rssi_dbm = dbm;
                    }
                }
            }
        }
    }

    // Check if connected
    if state != "connected" || ssid.is_empty() {
        return HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "connected": false
        }));
    }

    // Convert RSSI (dBm) to signal percentage
    // RSSI typically ranges from -90 dBm (poor) to -30 dBm (excellent)
    let signal = rssi_to_percentage(rssi_dbm);

    // Get gateway and DNS using ip route
    let (gateway, dns) = get_gateway_and_dns(&WIFI_CONFIG.client_interface);

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "connected": true,
        "ssid": ssid,
        "signal": signal,
        "ip_address": ip_address,
        "gateway": gateway,
        "dns": dns
    }))
}

// Helper function to strip ANSI color codes
fn strip_ansi_codes(text: &str) -> String {
    let mut result = String::new();
    let mut in_escape = false;

    for ch in text.chars() {
        if ch == '\x1b' {
            in_escape = true;
        } else if in_escape {
            if ch == 'm' {
                in_escape = false;
            }
        } else {
            result.push(ch);
        }
    }

    result
}

// Helper function to extract property value from iwctl output
fn extract_property_value(line: &str) -> Option<String> {
    // Format: "  Settable  Property              Value"
    // or:     "            State                 connected"
    let parts: Vec<&str> = line.split_whitespace().collect();

    // Find the property name and value
    // The value is everything after the property name
    if parts.len() >= 2 {
        // Look for known property names and get everything after
        for (i, part) in parts.iter().enumerate() {
            if ["State", "network", "address", "RSSI"].iter().any(|p| part.contains(p)) {
                // Value is everything after this property name
                if i + 1 < parts.len() {
                    return Some(parts[i + 1..].join(" "));
                }
            }
        }
    }

    None
}

// Helper function to convert RSSI (dBm) to percentage
fn rssi_to_percentage(rssi: i32) -> u8 {
    // RSSI to percentage conversion
    // Excellent: -30 dBm = 100%
    // Good: -67 dBm = 50%
    // Poor: -90 dBm = 0%

    if rssi >= -30 {
        100
    } else if rssi <= -90 {
        0
    } else {
        // Linear interpolation between -90 and -30
        let percentage = 2 * (rssi + 100);
        percentage.max(0).min(100) as u8
    }
}

// Helper function to get gateway and DNS for an interface
fn get_gateway_and_dns(interface: &str) -> (String, String) {
    let mut gateway = String::from("N/A");
    let mut dns = String::from("N/A");

    // Get gateway from ip route
    if let Ok(output) = Command::new("ip")
        .args(["route", "show", "dev", interface])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains("default via") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(idx) = parts.iter().position(|&s| s == "via") {
                    if let Some(gw) = parts.get(idx + 1) {
                        gateway = gw.to_string();
                        break;
                    }
                }
            }
        }
    }

    // Get DNS from resolvectl or /etc/resolv.conf
    if let Ok(output) = Command::new("resolvectl")
        .args(["status", interface])
        .output()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.trim().starts_with("DNS Servers:") || line.trim().starts_with("Current DNS Server:") {
                let parts: Vec<&str> = line.split(':').collect();
                if parts.len() >= 2 {
                    dns = parts[1].trim().to_string();
                    break;
                }
            }
        }
    }

    // Fallback: read /etc/resolv.conf
    if dns == "N/A" {
        if let Ok(contents) = fs::read_to_string("/etc/resolv.conf") {
            for line in contents.lines() {
                if line.trim().starts_with("nameserver") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        dns = parts[1].to_string();
                        break;
                    }
                }
            }
        }
    }

    (gateway, dns)
}

// Helper function to get known networks from iwd
fn get_iwd_known_networks() -> Vec<KnownNetwork> {
    let mut networks = Vec::new();
    let iwd_dir = "/var/lib/iwd";

    // Read the iwd directory for known network files
    if let Ok(entries) = fs::read_dir(iwd_dir) {
        for entry in entries.flatten() {
            if let Ok(file_name) = entry.file_name().into_string() {
                // iwd stores networks as "SSID.psk", "SSID.open", or "SSID.8021x"
                if file_name.ends_with(".psk") || file_name.ends_with(".open") || file_name.ends_with(".8021x") {
                    // Extract SSID by removing the extension
                    let ssid = file_name
                        .trim_end_matches(".psk")
                        .trim_end_matches(".open")
                        .trim_end_matches(".8021x")
                        .to_string();

                    // Skip the hotspot SSID
                    if ssid == WIFI_CONFIG.hotspot_ssid {
                        continue;
                    }

                    // Use the filename as the UUID (iwd doesn't use UUIDs)
                    networks.push(KnownNetwork {
                        name: ssid,
                        uuid: file_name.clone(),
                    });
                }
            }
        }
    }

    // Sort networks alphabetically by name
    networks.sort_by(|a, b| a.name.cmp(&b.name));

    networks
}