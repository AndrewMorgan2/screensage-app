use crate::battle_handlers::BattleState;
use crate::debug_stats::ServerStats;
use crate::process_manager::{ProcessManager, ProcessStatus};
use crate::refresh_notifier::RefreshState;
use actix_web::web;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::sleep;

/// How often to log detailed stats (every 60 seconds)
const STATS_LOG_INTERVAL_SECS: u64 = 60;

/// How often to run health checks (every 5 seconds)
const HEALTH_CHECK_INTERVAL_SECS: u64 = 5;

/// Maximum allowed battle states before automatic cleanup
const MAX_BATTLE_STATES: usize = 200;

/// Maximum allowed refresh states before automatic cleanup
const MAX_REFRESH_STATES: usize = 100;

/// Health monitor background task
/// Checks process health every 5 seconds and auto-restarts crashed processes
/// Also logs periodic debug stats and performs automatic cleanup
pub async fn health_monitor_task(
    manager: Arc<ProcessManager>,
    stats: Arc<ServerStats>,
    battle_states: web::Data<Mutex<HashMap<String, BattleState>>>,
    refresh_states: web::Data<Mutex<HashMap<String, RefreshState>>>,
) {
    tracing::info!("Health monitor started (with debug stats tracking)");

    let mut stats_log_counter: u64 = 0;
    let stats_log_interval = STATS_LOG_INTERVAL_SECS / HEALTH_CHECK_INTERVAL_SECS;

    loop {
        sleep(Duration::from_secs(HEALTH_CHECK_INTERVAL_SECS)).await;

        stats_log_counter += 1;

        // Get current counts for stats
        let battle_count = battle_states.lock().map(|s| s.len()).unwrap_or(0);
        let refresh_count = refresh_states.lock().map(|s| s.len()).unwrap_or(0);
        let process_count = manager.list_processes().len();

        // Periodic stats logging
        if stats_log_counter >= stats_log_interval {
            stats_log_counter = 0;

            let status = stats.log_status(battle_count, refresh_count, process_count);
            tracing::info!("SERVER STATS: {}", status);

            // Check for warning conditions
            if battle_count > MAX_BATTLE_STATES / 2 {
                tracing::warn!(
                    "Battle states count ({}) approaching limit ({})",
                    battle_count,
                    MAX_BATTLE_STATES
                );
            }
            if refresh_count > MAX_REFRESH_STATES / 2 {
                tracing::warn!(
                    "Refresh states count ({}) approaching limit ({})",
                    refresh_count,
                    MAX_REFRESH_STATES
                );
            }

            // Automatic cleanup if limits exceeded
            if battle_count > MAX_BATTLE_STATES {
                if let Ok(mut states) = battle_states.lock() {
                    let to_remove = states.len() - (MAX_BATTLE_STATES / 2);
                    let keys: Vec<String> = states.keys().take(to_remove).cloned().collect();
                    for key in &keys {
                        states.remove(key);
                    }
                    tracing::info!("Auto-cleaned {} old battle states", keys.len());
                }
            }

            if refresh_count > MAX_REFRESH_STATES {
                if let Ok(mut states) = refresh_states.lock() {
                    let to_remove = states.len() - (MAX_REFRESH_STATES / 2);
                    let keys: Vec<String> = states.keys().take(to_remove).cloned().collect();
                    for key in &keys {
                        states.remove(key);
                    }
                    tracing::info!("Auto-cleaned {} old refresh states", keys.len());
                }
            }
        }

        let processes = manager.list_processes();

        for proc in processes {
            // Skip if process is already being stopped
            if proc.status == ProcessStatus::Stopping || proc.status == ProcessStatus::Stopped {
                continue;
            }

            // Check if process is alive
            match manager.check_health(&proc.id) {
                Ok(is_alive) => {
                    if !is_alive && proc.auto_restart {
                        tracing::warn!(
                            process_id = %proc.id,
                            pid = proc.pid,
                            restart_count = proc.restart_count,
                            "Process crashed, initiating auto-restart"
                        );

                        // Exponential backoff with max 30 seconds
                        let backoff = std::cmp::min(proc.restart_count * 2, 30);

                        if backoff > 0 {
                            tracing::info!(
                                process_id = %proc.id,
                                backoff_seconds = backoff,
                                "Waiting before restart"
                            );
                            sleep(Duration::from_secs(backoff as u64)).await;
                        }

                        // Attempt restart
                        match manager.restart_process(&proc.id) {
                            Ok(new_pid) => {
                                tracing::info!(
                                    process_id = %proc.id,
                                    old_pid = proc.pid,
                                    new_pid = new_pid,
                                    restart_count = proc.restart_count + 1,
                                    "Process restarted successfully"
                                );
                            }
                            Err(e) => {
                                tracing::error!(
                                    process_id = %proc.id,
                                    error = %e,
                                    "Failed to restart process"
                                );

                                // If restart fails too many times, stop trying
                                if proc.restart_count >= 5 {
                                    tracing::error!(
                                        process_id = %proc.id,
                                        restart_count = proc.restart_count,
                                        "Too many restart failures, giving up"
                                    );
                                    // Process will remain in crashed state
                                }
                            }
                        }
                    } else if !is_alive && !proc.auto_restart {
                        tracing::info!(
                            process_id = %proc.id,
                            pid = proc.pid,
                            "Process crashed (auto-restart disabled)"
                        );
                    }
                }
                Err(e) => {
                    tracing::error!(
                        process_id = %proc.id,
                        error = %e,
                        "Health check failed"
                    );
                }
            }
        }

        // Log periodic status
        let running = manager.running_count();
        let crashed = manager.crashed_count();

        if running > 0 || crashed > 0 {
            tracing::debug!(
                running = running,
                crashed = crashed,
                "Health monitor status"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::process_manager::ProcessManager;

    #[tokio::test]
    async fn test_health_monitor_starts() {
        let manager = Arc::new(ProcessManager::new());
        let stats = Arc::new(ServerStats::new());
        let battle_states = web::Data::new(Mutex::new(HashMap::<String, BattleState>::new()));
        let refresh_states = web::Data::new(Mutex::new(HashMap::<String, RefreshState>::new()));

        // Start monitor in background
        let manager_clone = manager.clone();
        let stats_clone = stats.clone();
        let battle_clone = battle_states.clone();
        let refresh_clone = refresh_states.clone();

        let _handle = tokio::spawn(async move {
            tokio::time::timeout(
                Duration::from_secs(1),
                health_monitor_task(manager_clone, stats_clone, battle_clone, refresh_clone)
            ).await
        });

        // Monitor should run without panicking
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}
