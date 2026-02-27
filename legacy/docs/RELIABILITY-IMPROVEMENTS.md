# ScreenSage Reliability Improvements

## Problem Statement

The current ScreenSage architecture is unreliable and crashes frequently, especially when running on embedded hardware (nodes). The system needs to be more API-focused with proper process management, health monitoring, and automatic recovery.

## Current Architecture Issues

### 1. Fire-and-Forget Process Spawning
**Problem**: Commands in `src/commands.rs` spawn processes using `Command::new().output()` which:
- Either blocks the API call (bad UX)
- Or creates orphaned processes (resource leak)
- No tracking of PIDs or process state

**Example** ([commands.rs:50-56](src/commands.rs#L50-L56)):
```rust
command: "bash".to_string(),
args: vec![
    "-c".to_string(),
    "./python-env/bin/python ./ScryingGlass/display_engine.py ./storage/scrying_glasses/battlemap.json".to_string(),
],
```

This spawns a Python process but doesn't track it, monitor it, or handle crashes.

### 2. No Process Registry
**Problem**: No centralized tracking of:
- What processes are running
- Their PIDs
- When they started
- Their current health status
- Which config file they're using

### 3. No Health Monitoring
**Problem**: If `display_engine.py` crashes:
- No detection mechanism
- No automatic restart
- No logging of failure
- User must manually check and restart

### 4. Missing Environment Setup
**Problem**: Display commands don't source environment variables, causing pygame errors.

**Documented in** [iso/DISPLAY-FIX.md](iso/DISPLAY-FIX.md) but **not implemented** in `src/commands.rs`.

### 5. Poor Error Recovery
**Problem**: When things fail:
- No retry logic
- No graceful degradation
- No structured error reporting
- Entire system can become unresponsive

### 6. Resource Constraints on Nodes
**Problem**: Running on embedded hardware with limited:
- Memory (orphaned processes exhaust RAM)
- CPU (no process priorities)
- Disk I/O (no resource limits)

## Proposed Solution: Process Manager Architecture

### Overview

Transform ScreenSage into a supervised service architecture with:
1. **Process Manager**: Centralized process lifecycle management
2. **Health Monitor**: Background task checking process health
3. **Auto-Recovery**: Automatic restart of crashed critical processes
4. **Structured API**: Clear endpoints for process control
5. **Resource Management**: Limits and priorities for processes

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Actix Web Server                      │
│                         :8080                            │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼─────┐         ┌──────▼──────┐
    │   API    │         │   Process   │
    │ Handlers │◄────────┤   Manager   │
    └──────────┘         │   Service   │
                         └──────┬──────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
         ┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
         │   Display   │ │   Health   │ │   Event    │
         │   Process   │ │  Monitor   │ │    Log     │
         │   Registry  │ │   (Auto-   │ │            │
         │             │ │   Restart) │ │            │
         └─────────────┘ └────────────┘ └────────────┘
```

## Implementation Plan

### Phase 1: Process Registry (Core Infrastructure)

**File**: `src/process_manager.rs`

```rust
use std::collections::HashMap;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use chrono::{DateTime, Utc};
use sysinfo::{System, SystemExt, ProcessExt};

#[derive(Clone, Debug)]
pub enum ProcessStatus {
    Running,
    Crashed,
    Stopping,
    Stopped,
}

#[derive(Clone, Debug)]
pub struct ManagedProcess {
    pub id: String,           // Unique ID (e.g., "display-battlemap")
    pub pid: u32,             // System PID
    pub command: String,      // Full command executed
    pub config_path: String,  // Config file path
    pub status: ProcessStatus,
    pub started_at: DateTime<Utc>,
    pub last_health_check: DateTime<Utc>,
    pub restart_count: u32,
    pub auto_restart: bool,   // Whether to auto-restart on crash
}

pub struct ProcessManager {
    processes: Arc<Mutex<HashMap<String, ManagedProcess>>>,
    system: Arc<Mutex<System>>,
}

impl ProcessManager {
    pub fn new() -> Self {
        ProcessManager {
            processes: Arc::new(Mutex::new(HashMap::new())),
            system: Arc::new(Mutex::new(System::new_all())),
        }
    }

    /// Start a new managed process
    pub fn start_process(
        &self,
        id: String,
        command: String,
        args: Vec<String>,
        config_path: String,
        auto_restart: bool,
    ) -> Result<u32, String> {
        // Stop existing process with same ID if running
        self.stop_process(&id)?;

        // Spawn process
        let mut cmd = Command::new(&command);
        cmd.args(&args);

        let child = cmd.spawn().map_err(|e| format!("Failed to spawn: {}", e))?;
        let pid = child.id();

        // Register in process map
        let managed = ManagedProcess {
            id: id.clone(),
            pid,
            command,
            config_path,
            status: ProcessStatus::Running,
            started_at: Utc::now(),
            last_health_check: Utc::now(),
            restart_count: 0,
            auto_restart,
        };

        self.processes.lock().unwrap().insert(id, managed);

        Ok(pid)
    }

    /// Stop a managed process
    pub fn stop_process(&self, id: &str) -> Result<(), String> {
        let mut processes = self.processes.lock().unwrap();

        if let Some(proc) = processes.get_mut(id) {
            // Kill process
            let _ = Command::new("kill")
                .arg(proc.pid.to_string())
                .output();

            proc.status = ProcessStatus::Stopped;
            processes.remove(id);
            Ok(())
        } else {
            Err(format!("Process '{}' not found", id))
        }
    }

    /// Check if process is actually running
    pub fn check_health(&self, id: &str) -> Result<bool, String> {
        let mut system = self.system.lock().unwrap();
        system.refresh_processes();

        let mut processes = self.processes.lock().unwrap();

        if let Some(proc) = processes.get_mut(id) {
            let is_running = system.process(sysinfo::Pid::from_u32(proc.pid)).is_some();

            proc.last_health_check = Utc::now();

            if !is_running {
                proc.status = ProcessStatus::Crashed;
            }

            Ok(is_running)
        } else {
            Err(format!("Process '{}' not found", id))
        }
    }

    /// Get status of all managed processes
    pub fn list_processes(&self) -> Vec<ManagedProcess> {
        self.processes.lock().unwrap().values().cloned().collect()
    }

    /// Get status of specific process
    pub fn get_process(&self, id: &str) -> Option<ManagedProcess> {
        self.processes.lock().unwrap().get(id).cloned()
    }

    /// Restart a crashed process
    pub fn restart_process(&self, id: &str) -> Result<u32, String> {
        let proc_info = self.get_process(id)
            .ok_or_else(|| format!("Process '{}' not found", id))?;

        // Extract info before stopping
        let command = proc_info.command.clone();
        let config_path = proc_info.config_path.clone();
        let auto_restart = proc_info.auto_restart;

        // Parse command and args (simplified - may need enhancement)
        let parts: Vec<String> = command.split_whitespace().map(String::from).collect();
        let cmd = parts.get(0).ok_or("Invalid command")?.clone();
        let args = parts.into_iter().skip(1).collect();

        // Stop and restart
        self.stop_process(id)?;

        let mut processes = self.processes.lock().unwrap();
        if let Some(proc) = processes.get_mut(id) {
            proc.restart_count += 1;
        }
        drop(processes);

        self.start_process(id.to_string(), cmd, args, config_path, auto_restart)
    }
}
```

### Phase 2: Health Monitor Background Task

**File**: `src/health_monitor.rs`

```rust
use crate::process_manager::{ProcessManager, ProcessStatus};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

pub async fn health_monitor_task(manager: Arc<ProcessManager>) {
    loop {
        sleep(Duration::from_secs(5)).await;

        let processes = manager.list_processes();

        for proc in processes {
            // Check if process is alive
            match manager.check_health(&proc.id) {
                Ok(is_alive) => {
                    if !is_alive && proc.auto_restart {
                        println!(
                            "Process '{}' (PID: {}) crashed. Auto-restarting...",
                            proc.id, proc.pid
                        );

                        // Restart with exponential backoff
                        let backoff = std::cmp::min(proc.restart_count * 2, 30);
                        sleep(Duration::from_secs(backoff as u64)).await;

                        match manager.restart_process(&proc.id) {
                            Ok(new_pid) => {
                                println!(
                                    "Process '{}' restarted with PID {}",
                                    proc.id, new_pid
                                );
                            }
                            Err(e) => {
                                eprintln!(
                                    "Failed to restart process '{}': {}",
                                    proc.id, e
                                );
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Health check failed for '{}': {}", proc.id, e);
                }
            }
        }
    }
}
```

### Phase 3: New API Endpoints

**File**: `src/process_handlers.rs`

```rust
use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::process_manager::ProcessManager;

#[derive(Deserialize)]
pub struct StartDisplayRequest {
    pub config_path: String,
    pub display_id: String,
    pub auto_restart: bool,
}

#[derive(Serialize)]
pub struct ProcessResponse {
    pub success: bool,
    pub message: String,
    pub pid: Option<u32>,
}

/// POST /api/process/display/start
pub async fn start_display(
    req: web::Json<StartDisplayRequest>,
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    // Build command with environment sourcing
    let command = "bash";
    let args = vec![
        "-c".to_string(),
        format!(
            "[ -f ./screensage-env.sh ] && source ./screensage-env.sh; ./python-env/bin/python ./ScryingGlass/display_engine.py {}",
            req.config_path
        ),
    ];

    match manager.start_process(
        req.display_id.clone(),
        command.to_string(),
        args,
        req.config_path.clone(),
        req.auto_restart,
    ) {
        Ok(pid) => HttpResponse::Ok().json(ProcessResponse {
            success: true,
            message: format!("Display '{}' started", req.display_id),
            pid: Some(pid),
        }),
        Err(e) => HttpResponse::InternalServerError().json(ProcessResponse {
            success: false,
            message: format!("Failed to start display: {}", e),
            pid: None,
        }),
    }
}

/// POST /api/process/display/stop/{id}
pub async fn stop_display(
    path: web::Path<String>,
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    let display_id = path.into_inner();

    match manager.stop_process(&display_id) {
        Ok(_) => HttpResponse::Ok().json(ProcessResponse {
            success: true,
            message: format!("Display '{}' stopped", display_id),
            pid: None,
        }),
        Err(e) => HttpResponse::NotFound().json(ProcessResponse {
            success: false,
            message: format!("Failed to stop display: {}", e),
            pid: None,
        }),
    }
}

/// GET /api/process/status
pub async fn list_processes(
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    let processes = manager.list_processes();
    HttpResponse::Ok().json(processes)
}

/// POST /api/process/restart/{id}
pub async fn restart_display(
    path: web::Path<String>,
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    let display_id = path.into_inner();

    match manager.restart_process(&display_id) {
        Ok(pid) => HttpResponse::Ok().json(ProcessResponse {
            success: true,
            message: format!("Display '{}' restarted", display_id),
            pid: Some(pid),
        }),
        Err(e) => HttpResponse::InternalServerError().json(ProcessResponse {
            success: false,
            message: format!("Failed to restart display: {}", e),
            pid: None,
        }),
    }
}
```

### Phase 4: Update main.rs

```rust
mod process_manager;
mod health_monitor;
mod process_handlers;

use std::sync::Arc;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize process manager
    let process_manager = Arc::new(process_manager::ProcessManager::new());

    // Start health monitor background task
    let pm_clone = process_manager.clone();
    tokio::spawn(async move {
        health_monitor::health_monitor_task(pm_clone).await;
    });

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(process_manager.clone()))
            // Process control endpoints
            .route("/api/process/display/start", web::post().to(process_handlers::start_display))
            .route("/api/process/display/stop/{id}", web::post().to(process_handlers::stop_display))
            .route("/api/process/restart/{id}", web::post().to(process_handlers::restart_display))
            .route("/api/process/status", web::get().to(process_handlers::list_processes))
            // ... existing routes ...
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
```

### Phase 5: Update commands.rs

Replace fire-and-forget commands with process manager calls:

```rust
pub fn initialize_commands() -> HashMap<String, PredefinedCommand> {
    let mut commands = HashMap::new();

    // Instead of spawning directly, use process manager API
    commands.insert(
        "start-battlemap-screen".to_string(),
        PredefinedCommand {
            name: "Start Battle".to_string(),
            // This now calls the API endpoint
            command: "curl".to_string(),
            args: vec![
                "-X".to_string(),
                "POST".to_string(),
                "http://localhost:8080/api/process/display/start".to_string(),
                "-H".to_string(),
                "Content-Type: application/json".to_string(),
                "-d".to_string(),
                r#"{"config_path":"./storage/scrying_glasses/battlemap.json","display_id":"battlemap","auto_restart":true}"#.to_string(),
            ],
        },
    );

    // Stop command uses process manager
    commands.insert(
        "stop-display".to_string(),
        PredefinedCommand {
            name: "Stop Display".to_string(),
            command: "curl".to_string(),
            args: vec![
                "-X".to_string(),
                "POST".to_string(),
                "http://localhost:8080/api/process/display/stop/battlemap".to_string(),
            ],
        },
    );

    commands
}
```

## Additional Improvements

### Resource Limits

Add to `ProcessManager::start_process()`:

```rust
use std::os::unix::process::CommandExt;

cmd.process_group(0); // Create process group for easier cleanup

// Set resource limits (Linux)
use rlimit::{setrlimit, Resource};
setrlimit(Resource::AS, 512 * 1024 * 1024, 1024 * 1024 * 1024)?; // 512MB soft, 1GB hard
```

### Structured Logging

Replace `println!` with proper logging:

```rust
use tracing::{info, warn, error};

info!(
    process_id = %proc.id,
    pid = proc.pid,
    "Process started successfully"
);
```

### Process Priority

For embedded systems, set lower priority for display processes:

```rust
use libc::{setpriority, PRIO_PROCESS};
unsafe {
    setpriority(PRIO_PROCESS, pid as i32, 10); // Lower priority
}
```

## Migration Path

1. **Phase 1**: Add process manager infrastructure (doesn't break existing code)
2. **Phase 2**: Add health monitor (background task, non-breaking)
3. **Phase 3**: Add new API endpoints alongside old ones
4. **Phase 4**: Update UI to use new endpoints
5. **Phase 5**: Deprecate old command execution
6. **Phase 6**: Remove old fire-and-forget system

## Benefits

1. **Reliability**: Auto-restart of crashed processes
2. **Visibility**: Know what's running, when it started, crash count
3. **Control**: Start/stop/restart any process via API
4. **Resource Management**: Limits prevent memory exhaustion
5. **Debugging**: Structured logs show process lifecycle
6. **Scalability**: Can manage multiple displays, services
7. **API-First**: All operations via REST API, easier to integrate

## Dependencies to Add

```toml
[dependencies]
actix-web = "4"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
chrono = "0.4"
sysinfo = "0.30"
tracing = "0.1"
tracing-subscriber = "0.3"
rlimit = "0.10"  # For resource limits
libc = "0.2"      # For process priorities
```

## Testing

```bash
# Start display
curl -X POST http://localhost:8080/api/process/display/start \
  -H "Content-Type: application/json" \
  -d '{"config_path":"./storage/scrying_glasses/battlemap.json","display_id":"battlemap","auto_restart":true}'

# Check status
curl http://localhost:8080/api/process/status

# Stop display
curl -X POST http://localhost:8080/api/process/display/stop/battlemap

# Restart display
curl -X POST http://localhost:8080/api/process/restart/battlemap
```

## Next Steps

Should I implement this process manager architecture? This will significantly improve reliability on embedded nodes.
