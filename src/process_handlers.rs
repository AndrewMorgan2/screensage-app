use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::process_manager::ProcessManager;

#[derive(Deserialize)]
pub struct StartDisplayRequest {
    pub config_path: String,
    pub display_id: String,
    #[serde(default = "default_auto_restart")]
    pub auto_restart: bool,
}

fn default_auto_restart() -> bool {
    true
}

#[derive(Serialize)]
pub struct ProcessResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
}

#[derive(Serialize)]
pub struct ProcessListResponse {
    pub success: bool,
    pub processes: Vec<crate::process_manager::ManagedProcess>,
    pub running_count: usize,
    pub crashed_count: usize,
}

/// POST /api/process/display/start
/// Start a display engine process
pub async fn start_display(
    req: web::Json<StartDisplayRequest>,
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    tracing::info!(
        display_id = %req.display_id,
        config_path = %req.config_path,
        auto_restart = req.auto_restart,
        "API request to start display"
    );

    // Build command with environment sourcing
    // Use setsid to make Python the session leader so it survives server shutdown
    let command = "bash";
    let args = vec![
        "-c".to_string(),
        format!(
            "[ -f ./screensage-env.sh ] && source ./screensage-env.sh; setsid -f ./python-env/bin/python ./ScryingGlass_pyglet/display_engine_pyglet.py {}",
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
        Ok(pid) => {
            tracing::info!(
                display_id = %req.display_id,
                pid = pid,
                "Display started successfully"
            );
            HttpResponse::Ok().json(ProcessResponse {
                success: true,
                message: format!("Display '{}' started with PID {}", req.display_id, pid),
                pid: Some(pid),
            })
        }
        Err(e) => {
            tracing::error!(
                display_id = %req.display_id,
                error = %e,
                "Failed to start display"
            );
            HttpResponse::InternalServerError().json(ProcessResponse {
                success: false,
                message: format!("Failed to start display: {}", e),
                pid: None,
            })
        }
    }
}

/// POST /api/process/display/stop/{id}
/// Stop a running display engine process
pub async fn stop_display(
    path: web::Path<String>,
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    let display_id = path.into_inner();

    tracing::info!(
        display_id = %display_id,
        "API request to stop display"
    );

    match manager.stop_process(&display_id) {
        Ok(_) => {
            tracing::info!(
                display_id = %display_id,
                "Display stopped successfully"
            );
            HttpResponse::Ok().json(ProcessResponse {
                success: true,
                message: format!("Display '{}' stopped", display_id),
                pid: None,
            })
        }
        Err(e) => {
            tracing::warn!(
                display_id = %display_id,
                error = %e,
                "Failed to stop display"
            );
            HttpResponse::NotFound().json(ProcessResponse {
                success: false,
                message: format!("Failed to stop display: {}", e),
                pid: None,
            })
        }
    }
}

/// POST /api/process/display/stop-all
/// Stop all running display processes
pub async fn stop_all_displays(
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    tracing::info!("API request to stop all displays");

    manager.stop_all_processes();

    HttpResponse::Ok().json(ProcessResponse {
        success: true,
        message: "All displays stopped".to_string(),
        pid: None,
    })
}

/// GET /api/process/status
/// List all managed processes with their status
pub async fn list_processes(
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    let processes = manager.list_processes();
    let running_count = manager.running_count();
    let crashed_count = manager.crashed_count();

    tracing::debug!(
        process_count = processes.len(),
        running_count = running_count,
        crashed_count = crashed_count,
        "API request for process status"
    );

    HttpResponse::Ok().json(ProcessListResponse {
        success: true,
        processes,
        running_count,
        crashed_count,
    })
}

/// GET /api/process/status/{id}
/// Get status of a specific process
pub async fn get_process_status(
    path: web::Path<String>,
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    let display_id = path.into_inner();

    tracing::debug!(
        display_id = %display_id,
        "API request for specific process status"
    );

    match manager.get_process(&display_id) {
        Some(process) => HttpResponse::Ok().json(process),
        None => HttpResponse::NotFound().json(ProcessResponse {
            success: false,
            message: format!("Process '{}' not found", display_id),
            pid: None,
        }),
    }
}

/// POST /api/process/restart/{id}
/// Restart a process (works for both running and crashed)
pub async fn restart_display(
    path: web::Path<String>,
    manager: web::Data<Arc<ProcessManager>>,
) -> impl Responder {
    let display_id = path.into_inner();

    tracing::info!(
        display_id = %display_id,
        "API request to restart display"
    );

    match manager.restart_process(&display_id) {
        Ok(pid) => {
            tracing::info!(
                display_id = %display_id,
                new_pid = pid,
                "Display restarted successfully"
            );
            HttpResponse::Ok().json(ProcessResponse {
                success: true,
                message: format!("Display '{}' restarted with PID {}", display_id, pid),
                pid: Some(pid),
            })
        }
        Err(e) => {
            tracing::error!(
                display_id = %display_id,
                error = %e,
                "Failed to restart display"
            );
            HttpResponse::InternalServerError().json(ProcessResponse {
                success: false,
                message: format!("Failed to restart display: {}", e),
                pid: None,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::{test, App};

    #[actix_web::test]
    async fn test_list_processes_empty() {
        let manager = Arc::new(ProcessManager::new());
        let app = test::init_service(
            App::new()
                .app_data(web::Data::new(manager))
                .route("/api/process/status", web::get().to(list_processes)),
        )
        .await;

        let req = test::TestRequest::get()
            .uri("/api/process/status")
            .to_request();

        let resp: ProcessListResponse = test::call_and_read_body_json(&app, req).await;

        assert!(resp.success);
        assert_eq!(resp.processes.len(), 0);
        assert_eq!(resp.running_count, 0);
        assert_eq!(resp.crashed_count, 0);
    }
}
