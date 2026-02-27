use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use sysinfo::{Pid, System};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ProcessStatus {
    Running,
    Crashed,
    Stopping,
    Stopped,
}

#[derive(Clone, Debug, Serialize)]
pub struct ManagedProcess {
    pub id: String,
    pub pid: u32,
    pub command: String,
    pub config_path: String,
    pub status: ProcessStatus,
    pub started_at: DateTime<Utc>,
    pub last_health_check: DateTime<Utc>,
    pub restart_count: u32,
    pub auto_restart: bool,
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
        let _ = self.stop_process(&id);

        tracing::info!(
            process_id = %id,
            command = %command,
            "Starting managed process"
        );

        // Spawn process
        let mut cmd = Command::new(&command);
        cmd.args(&args);
        cmd.stdin(Stdio::null());
        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());

        // On Unix, create a new process group so the child survives parent exit
        #[cfg(unix)]
        unsafe {
            cmd.pre_exec(|| {
                // Create a new session, making this process the leader
                // This detaches it from the parent's terminal and process group
                libc::setsid();
                Ok(())
            });
        }

        let child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn process: {}", e))?;

        let pid = child.id();

        // Don't wait for child - let it run independently
        std::mem::forget(child);

        // Register in process map
        let managed = ManagedProcess {
            id: id.clone(),
            pid,
            command: format!("{} {}", command, args.join(" ")),
            config_path,
            status: ProcessStatus::Running,
            started_at: Utc::now(),
            last_health_check: Utc::now(),
            restart_count: 0,
            auto_restart,
        };

        self.processes.lock().unwrap().insert(id.clone(), managed);

        tracing::info!(
            process_id = %id,
            pid = pid,
            "Process started successfully"
        );

        Ok(pid)
    }

    /// Stop a managed process
    pub fn stop_process(&self, id: &str) -> Result<(), String> {
        let mut processes = self.processes.lock().unwrap();

        if let Some(mut proc) = processes.remove(id) {
            tracing::info!(
                process_id = %id,
                pid = proc.pid,
                "Stopping process"
            );

            proc.status = ProcessStatus::Stopping;

            // Try graceful kill first
            let _ = Command::new("kill")
                .arg("-TERM")
                .arg(proc.pid.to_string())
                .output();

            // Wait a bit
            std::thread::sleep(std::time::Duration::from_millis(500));

            // Force kill if still running
            let _ = Command::new("kill")
                .arg("-9")
                .arg(proc.pid.to_string())
                .output();

            tracing::info!(
                process_id = %id,
                pid = proc.pid,
                "Process stopped"
            );

            Ok(())
        } else {
            Err(format!("Process '{}' not found", id))
        }
    }

    /// Stop all managed processes
    pub fn stop_all_processes(&self) {
        let process_ids: Vec<String> = self
            .processes
            .lock()
            .unwrap()
            .keys()
            .cloned()
            .collect();

        for id in process_ids {
            let _ = self.stop_process(&id);
        }
    }

    /// Check if process is actually running
    pub fn check_health(&self, id: &str) -> Result<bool, String> {
        let mut system = self.system.lock().unwrap();
        system.refresh_processes();

        let mut processes = self.processes.lock().unwrap();

        if let Some(proc) = processes.get_mut(id) {
            let pid = Pid::from_u32(proc.pid);
            let is_running = system.process(pid).is_some();

            proc.last_health_check = Utc::now();

            if !is_running && proc.status == ProcessStatus::Running {
                tracing::warn!(
                    process_id = %id,
                    pid = proc.pid,
                    "Process crashed or died"
                );
                proc.status = ProcessStatus::Crashed;
            }

            Ok(is_running)
        } else {
            Err(format!("Process '{}' not found", id))
        }
    }

    /// Get status of all managed processes
    pub fn list_processes(&self) -> Vec<ManagedProcess> {
        self.processes
            .lock()
            .unwrap()
            .values()
            .cloned()
            .collect()
    }

    /// Get status of specific process
    pub fn get_process(&self, id: &str) -> Option<ManagedProcess> {
        self.processes.lock().unwrap().get(id).cloned()
    }

    /// Restart a crashed or running process
    pub fn restart_process(&self, id: &str) -> Result<u32, String> {
        let proc_info = self
            .get_process(id)
            .ok_or_else(|| format!("Process '{}' not found", id))?;

        tracing::info!(
            process_id = %id,
            old_pid = proc_info.pid,
            restart_count = proc_info.restart_count,
            "Restarting process"
        );

        // Extract info before stopping
        let config_path = proc_info.config_path.clone();
        let auto_restart = proc_info.auto_restart;
        let restart_count = proc_info.restart_count;

        // Parse command and args from the full command string
        // Simplified parsing - assumes bash -c "..." format
        // Use setsid -f to make Python survive server shutdown
        let command = "bash".to_string();
        let args = vec![
            "-c".to_string(),
            format!(
                "[ -f ./screensage-env.sh ] && source ./screensage-env.sh; setsid -f ./python-env/bin/python ./ScryingGlass_pyglet/display_engine_pyglet.py {}",
                config_path
            ),
        ];

        // Stop the old process
        self.stop_process(id)?;

        // Start new process
        let new_pid = self.start_process(
            id.to_string(),
            command,
            args,
            config_path,
            auto_restart,
        )?;

        // Increment restart count
        if let Some(proc) = self.processes.lock().unwrap().get_mut(id) {
            proc.restart_count = restart_count + 1;
        }

        tracing::info!(
            process_id = %id,
            new_pid = new_pid,
            restart_count = restart_count + 1,
            "Process restarted successfully"
        );

        Ok(new_pid)
    }

    /// Get count of running processes
    pub fn running_count(&self) -> usize {
        self.processes
            .lock()
            .unwrap()
            .values()
            .filter(|p| p.status == ProcessStatus::Running)
            .count()
    }

    /// Get count of crashed processes
    pub fn crashed_count(&self) -> usize {
        self.processes
            .lock()
            .unwrap()
            .values()
            .filter(|p| p.status == ProcessStatus::Crashed)
            .count()
    }
}

// Note: No Drop implementation - Python games should continue running
// even when the server shuts down. Use stop_all_processes() explicitly
// if you want to clean up processes before shutdown.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_process_manager_creation() {
        let manager = ProcessManager::new();
        assert_eq!(manager.running_count(), 0);
    }

    #[test]
    fn test_process_lifecycle() {
        let manager = ProcessManager::new();

        // Start a simple process
        let result = manager.start_process(
            "test-sleep".to_string(),
            "sleep".to_string(),
            vec!["10".to_string()],
            "test-config".to_string(),
            false,
        );

        assert!(result.is_ok());
        assert_eq!(manager.running_count(), 1);

        // Stop the process
        let stop_result = manager.stop_process("test-sleep");
        assert!(stop_result.is_ok());
    }
}
