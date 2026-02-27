use serde::{Deserialize, Serialize};

/// Request structure for command execution
#[derive(Deserialize)]
pub struct CommandRequest {
    /// The command to execute
    pub command: String,
    /// Optional arguments for the command
    pub args: Option<Vec<String>>,
}

/// Response structure for command execution results
#[derive(Serialize)]
pub struct CommandResult {
    /// Whether the command executed successfully
    pub success: bool,
    /// Standard output from the command
    pub stdout: String,
    /// Standard error from the command
    pub stderr: String,
    /// Exit code from the command (if available)
    pub exit_code: Option<i32>,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize)]
pub struct MediaCommandRequest {
    pub command: String,         // Type of command: "info", "copy", "custom"
    pub path: String,            // Relative path to the media file
    pub custom_command: Option<String>, // For custom commands
}

/// Predefined command configuration
#[derive(Clone)]
pub struct PredefinedCommand {
    /// Display name for the command
    pub name: String,
    /// Description of what the command does
    /// The actual command to execute
    pub command: String,
    /// Arguments to pass to the command
    pub args: Vec<String>,
}

/// Response structure for OBS status
#[allow(dead_code)]
#[derive(Serialize)]
pub struct ObsStatusResponse {
    /// Whether OBS is connected
    pub connected: bool,
    /// The current scene name (if available)
    pub current_scene: Option<String>,
    /// Whether recording is active
    pub recording: Option<bool>,
    /// Whether recording is paused
    pub recording_paused: Option<bool>,
    /// Whether streaming is active
    pub streaming: Option<bool>,
    /// Whether replay buffer is active
    pub replay_buffer: Option<bool>,
    /// Whether virtual camera is active
    pub virtual_camera: Option<bool>,
}

/// Response structure for OBS WebSocket connection configuration
#[allow(dead_code)]
#[derive(Serialize, Deserialize)]
pub struct ObsConnectionConfig {
    /// The hostname or IP address
    pub hostname: String,
    /// The port number
    pub port: u16,
    /// The password (if required)
    pub password: Option<String>,
}

// Add these models to your models.rs file

#[allow(dead_code)]
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