//! Debug Statistics Module for ScreenSage Server
//!
//! Provides runtime monitoring and debugging capabilities to help diagnose
//! crashes and memory issues during prolonged server operation.

#![allow(dead_code)] // Infrastructure for future integration

use chrono::{DateTime, Utc};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, RwLock};
use std::time::Instant;

/// Global server statistics - thread-safe counters
pub struct ServerStats {
    /// Server start time
    pub start_time: DateTime<Utc>,
    /// Monotonic start instant for uptime calculation
    start_instant: Instant,

    // Request counters (atomic for lock-free updates)
    pub total_requests: AtomicU64,
    pub failed_requests: AtomicU64,

    // Specific endpoint counters
    pub battle_saves: AtomicU64,
    pub battle_gets: AtomicU64,
    pub refresh_triggers: AtomicU64,
    pub process_starts: AtomicU64,
    pub process_stops: AtomicU64,

    // Error tracking
    pub mutex_lock_failures: AtomicU64,
    pub panic_count: AtomicU64,

    /// Recent errors (bounded)
    recent_errors: RwLock<Vec<ErrorRecord>>,
}

#[derive(Clone, Serialize)]
pub struct ErrorRecord {
    pub timestamp: DateTime<Utc>,
    pub error_type: String,
    pub message: String,
    pub context: Option<String>,
}

/// Snapshot of current server state for the debug endpoint
#[derive(Serialize)]
pub struct DebugSnapshot {
    // Timing
    pub server_start: String,
    pub uptime_seconds: u64,
    pub uptime_human: String,

    // Request stats
    pub total_requests: u64,
    pub failed_requests: u64,
    pub requests_per_minute: f64,

    // Endpoint stats
    pub battle_saves: u64,
    pub battle_gets: u64,
    pub refresh_triggers: u64,
    pub process_starts: u64,
    pub process_stops: u64,

    // Error stats
    pub mutex_lock_failures: u64,
    pub panic_count: u64,
    pub recent_errors: Vec<ErrorRecord>,

    // Memory stats (from HashMap sizes passed in)
    pub battle_states_count: usize,
    pub refresh_states_count: usize,
    pub managed_processes_count: usize,

    // Memory usage (if available)
    pub memory_usage_mb: Option<f64>,
}

impl ServerStats {
    pub fn new() -> Self {
        ServerStats {
            start_time: Utc::now(),
            start_instant: Instant::now(),
            total_requests: AtomicU64::new(0),
            failed_requests: AtomicU64::new(0),
            battle_saves: AtomicU64::new(0),
            battle_gets: AtomicU64::new(0),
            refresh_triggers: AtomicU64::new(0),
            process_starts: AtomicU64::new(0),
            process_stops: AtomicU64::new(0),
            mutex_lock_failures: AtomicU64::new(0),
            panic_count: AtomicU64::new(0),
            recent_errors: RwLock::new(Vec::with_capacity(100)),
        }
    }

    pub fn uptime_seconds(&self) -> u64 {
        self.start_instant.elapsed().as_secs()
    }

    pub fn uptime_human(&self) -> String {
        let secs = self.uptime_seconds();
        let hours = secs / 3600;
        let minutes = (secs % 3600) / 60;
        let seconds = secs % 60;
        format!("{}h {}m {}s", hours, minutes, seconds)
    }

    pub fn increment_requests(&self) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_failed(&self) {
        self.failed_requests.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_battle_saves(&self) {
        self.battle_saves.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_battle_gets(&self) {
        self.battle_gets.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_refresh_triggers(&self) {
        self.refresh_triggers.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_process_starts(&self) {
        self.process_starts.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_process_stops(&self) {
        self.process_stops.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_mutex_failures(&self) {
        self.mutex_lock_failures.fetch_add(1, Ordering::Relaxed);
    }

    pub fn increment_panics(&self) {
        self.panic_count.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_error(&self, error_type: &str, message: &str, context: Option<&str>) {
        let record = ErrorRecord {
            timestamp: Utc::now(),
            error_type: error_type.to_string(),
            message: message.to_string(),
            context: context.map(|s| s.to_string()),
        };

        if let Ok(mut errors) = self.recent_errors.write() {
            // Keep only last 100 errors
            if errors.len() >= 100 {
                errors.remove(0);
            }
            errors.push(record);
        }
    }

    pub fn get_recent_errors(&self) -> Vec<ErrorRecord> {
        self.recent_errors
            .read()
            .map(|e| e.clone())
            .unwrap_or_default()
    }

    /// Generate a snapshot of current server state
    pub fn snapshot(
        &self,
        battle_states_count: usize,
        refresh_states_count: usize,
        managed_processes_count: usize,
    ) -> DebugSnapshot {
        let uptime = self.uptime_seconds();
        let total_requests = self.total_requests.load(Ordering::Relaxed);
        let requests_per_minute = if uptime > 0 {
            (total_requests as f64 / uptime as f64) * 60.0
        } else {
            0.0
        };

        // Try to get memory usage (Linux-specific)
        let memory_usage_mb = get_memory_usage_mb();

        DebugSnapshot {
            server_start: self.start_time.format("%Y-%m-%d %H:%M:%S UTC").to_string(),
            uptime_seconds: uptime,
            uptime_human: self.uptime_human(),
            total_requests,
            failed_requests: self.failed_requests.load(Ordering::Relaxed),
            requests_per_minute,
            battle_saves: self.battle_saves.load(Ordering::Relaxed),
            battle_gets: self.battle_gets.load(Ordering::Relaxed),
            refresh_triggers: self.refresh_triggers.load(Ordering::Relaxed),
            process_starts: self.process_starts.load(Ordering::Relaxed),
            process_stops: self.process_stops.load(Ordering::Relaxed),
            mutex_lock_failures: self.mutex_lock_failures.load(Ordering::Relaxed),
            panic_count: self.panic_count.load(Ordering::Relaxed),
            recent_errors: self.get_recent_errors(),
            battle_states_count,
            refresh_states_count,
            managed_processes_count,
            memory_usage_mb,
        }
    }

    /// Generate a log-friendly status string
    pub fn log_status(
        &self,
        battle_states_count: usize,
        refresh_states_count: usize,
        managed_processes_count: usize,
    ) -> String {
        let mem = get_memory_usage_mb()
            .map(|m| format!("{:.1}MB", m))
            .unwrap_or_else(|| "N/A".to_string());

        format!(
            "UPTIME: {} | REQUESTS: {} | FAILED: {} | MEMORY: {} | STATES: battle={}, refresh={}, processes={}",
            self.uptime_human(),
            self.total_requests.load(Ordering::Relaxed),
            self.failed_requests.load(Ordering::Relaxed),
            mem,
            battle_states_count,
            refresh_states_count,
            managed_processes_count,
        )
    }
}

impl Default for ServerStats {
    fn default() -> Self {
        Self::new()
    }
}

/// Get current process memory usage in MB (Linux-specific)
fn get_memory_usage_mb() -> Option<f64> {
    // Read from /proc/self/statm on Linux
    if let Ok(content) = std::fs::read_to_string("/proc/self/statm") {
        let parts: Vec<&str> = content.split_whitespace().collect();
        if let Some(rss_pages) = parts.get(1) {
            if let Ok(pages) = rss_pages.parse::<u64>() {
                // Pages are typically 4KB on Linux
                let page_size = 4096u64;
                let bytes = pages * page_size;
                return Some(bytes as f64 / (1024.0 * 1024.0));
            }
        }
    }
    None
}

/// Safe mutex lock helper that records failures instead of panicking
pub fn safe_lock<'a, T>(
    mutex: &'a Mutex<T>,
    stats: Option<&ServerStats>,
    context: &str,
) -> Result<std::sync::MutexGuard<'a, T>, String> {
    match mutex.lock() {
        Ok(guard) => Ok(guard),
        Err(poisoned) => {
            let msg = format!("Mutex poisoned in {}: {:?}", context, poisoned);
            tracing::error!("{}", msg);

            if let Some(s) = stats {
                s.increment_mutex_failures();
                s.record_error("MUTEX_POISONED", &msg, Some(context));
            }

            // Try to recover the guard anyway
            Ok(poisoned.into_inner())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stats_creation() {
        let stats = ServerStats::new();
        assert_eq!(stats.total_requests.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn test_increment_counters() {
        let stats = ServerStats::new();
        stats.increment_requests();
        stats.increment_requests();
        stats.increment_failed();
        assert_eq!(stats.total_requests.load(Ordering::Relaxed), 2);
        assert_eq!(stats.failed_requests.load(Ordering::Relaxed), 1);
    }

    #[test]
    fn test_error_recording() {
        let stats = ServerStats::new();
        stats.record_error("TEST", "Test error", Some("test context"));
        let errors = stats.get_recent_errors();
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].error_type, "TEST");
    }

    #[test]
    fn test_uptime() {
        let stats = ServerStats::new();
        std::thread::sleep(std::time::Duration::from_millis(100));
        assert!(stats.uptime_seconds() >= 0);
    }
}
