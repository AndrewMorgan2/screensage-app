use actix_files as fs;
use actix_web::{web, App, HttpServer, HttpResponse, Responder};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

mod battle_handlers;
mod commands;
mod debug_stats;
mod handlers;
mod health_monitor;
mod image_handlers;
mod json_handlers;
mod models;
mod process_handlers;
mod process_manager;
mod refresh_notifier;
mod sageslate_handlers;
mod ws_handler;
mod template_loader;
mod upload_handlers;
mod vtt_handler;
mod display_handler;
mod draw_handler;
mod file_manager_handlers;
mod template_renderers;

use debug_stats::ServerStats;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize tracing/logging
    tracing_subscriber::fmt()
        .with_target(false)
        .with_thread_ids(false)
        .with_level(true)
        .init();

    tracing::info!("Starting ScreenSage...");

    // Initialize debug statistics tracking
    let server_stats = Arc::new(ServerStats::new());
    tracing::info!("Debug statistics initialized");

    // Initialize the predefined commands
    let commands = commands::initialize_commands();

    // Add inside the main function before HttpServer::new
    let battle_states = web::Data::new(Mutex::new(
        HashMap::<String, battle_handlers::BattleState>::new(),
    ));

    // Initialize refresh notifier shared state
    let refresh_states = web::Data::new(Mutex::new(
        HashMap::<String, refresh_notifier::RefreshState>::new(),
    ));
    tracing::info!("Refresh notifier initialized");

    // WebSocket broadcast channel — capacity 32 queued events per client
    let (ws_tx, _) = tokio::sync::broadcast::channel::<String>(32);
    let ws_tx = web::Data::new(ws_tx);
    tracing::info!("WebSocket broadcast channel initialized");

    // Initialize process manager
    let process_manager = Arc::new(process_manager::ProcessManager::new());
    tracing::info!("Process manager initialized");

    // Start health monitor background task with stats
    let pm_clone = process_manager.clone();
    let stats_clone = server_stats.clone();
    let battle_states_clone = battle_states.clone();
    let refresh_states_clone = refresh_states.clone();
    tokio::spawn(async move {
        health_monitor::health_monitor_task(
            pm_clone,
            stats_clone,
            battle_states_clone,
            refresh_states_clone,
        ).await;
    });
    tracing::info!("Health monitor task started (with debug stats)");

    let bind_address = "0.0.0.0:8080";
    println!("Starting Screen Sage at {}", bind_address);
    tracing::info!(address = %bind_address, "HTTP server starting");

    // Define the image directory path
    println!("Image directory path: ./images");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(commands.clone()))
            .app_data(battle_states.clone())
            .app_data(refresh_states.clone())
            .app_data(web::Data::new(process_manager.clone()))
            .app_data(web::Data::new(server_stats.clone()))
            .app_data(ws_tx.clone())
            // Routes for static files
            .service(fs::Files::new("/static", "./static").show_files_listing())
            // WebSocket endpoint
            .route("/ws", web::get().to(ws_handler::ws_handler))
            // Main routes
            .route("/", web::get().to(handlers::index))
            .route("/images", web::get().to(image_handlers::image_browser))
            .route("/sageslate", web::get().to(sageslate_handlers::sageslate))
            .route("/vtt", web::get().to(vtt_handler::vtt_render))
            .route("/display", web::get().to(display_handler::display_render))
            .route("/draw", web::get().to(draw_handler::draw_render))
            .route("/upload", web::get().to(handlers::upload))
            .route("/wifi", web::get().to(handlers::wifi))
            .route("/health", web::get().to(handlers::health_check))
            .route("/execute", web::post().to(handlers::execute_command))
            .route("/api/config", web::get().to(handlers::read_config))
            .route(
                "/commands/{command_id}",
                web::post().to(handlers::execute_predefined),
            )
            .route(
                "/run/command",
                web::post().to(handlers::execute_command),
            )
            // Process management API endpoints
            .route(
                "/api/process/display/start",
                web::post().to(process_handlers::start_display),
            )
            .route(
                "/api/process/display/stop/{id}",
                web::post().to(process_handlers::stop_display),
            )
            .route(
                "/api/process/display/stop-all",
                web::post().to(process_handlers::stop_all_displays),
            )
            .route(
                "/api/process/status",
                web::get().to(process_handlers::list_processes),
            )
            .route(
                "/api/process/status/{id}",
                web::get().to(process_handlers::get_process_status),
            )
            .route(
                "/api/process/restart/{id}",
                web::post().to(process_handlers::restart_display),
            )
            // Image browser API endpoints
            .route(
                "/api/images/list",
                web::get().to(image_handlers::list_directory),
            )
            .route(
                "/api/images/search",
                web::get().to(image_handlers::search_media),
            )
            .route(
                "/api/images/view",
                web::get().to(image_handlers::serve_media),
            )
            .route(
                "/api/images/display",
                web::post().to(image_handlers::display),
            )
            // File upload endpoints
            .route(
                "/api/upload/image",
                web::post().to(upload_handlers::upload_image),
            )
            .route(
                "/api/upload/overlay",
                web::post().to(upload_handlers::upload_overlay),
            )
            // WiFi management endpoints
            .route(
                "/api/wifi/scan",
                web::get().to(handlers::wifi_scan),
            )
            .route(
                "/api/wifi/current",
                web::get().to(handlers::wifi_current_connection),
            )
            .route(
                "/api/wifi/known",
                web::get().to(handlers::wifi_known_networks),
            )
            .route(
                "/api/wifi/clients",
                web::get().to(handlers::wifi_clients),
            )
            .route(
                "/api/wifi/hotspot-status",
                web::get().to(handlers::wifi_hotspot_status),
            )
            .route(
                "/api/wifi/connect",
                web::post().to(handlers::wifi_connect),
            )
            .route(
                "/api/wifi/hotspot-toggle",
                web::post().to(handlers::wifi_hotspot_toggle),
            )
            // Add battle routes
            .route("/battle", web::get().to(battle_handlers::battle_tracker))
            .route(
                "/api/battle/save",
                web::post().to(battle_handlers::save_battle_state),
            )
            .route(
                "/api/battle/get",
                web::get().to(battle_handlers::get_battle_state),
            )
            .route(
                "/api/battle/delete",
                web::get().to(battle_handlers::delete_battle_state),
            )
            .route("/json/read", web::get().to(json_handlers::read_json))
            .route("/json/save", web::post().to(json_handlers::save_json))
            .route("/api/files/move", web::post().to(file_manager_handlers::move_file))
            // Refresh notifier endpoints
            .route(
                "/api/refresh/trigger",
                web::post().to(refresh_notifier::trigger_refresh),
            )
            .route(
                "/api/refresh/check",
                web::get().to(refresh_notifier::check_refresh),
            )
            // Debug/monitoring endpoints
            .route(
                "/api/debug/stats",
                web::get().to(debug_stats_handler),
            )
            .route(
                "/api/debug/cleanup",
                web::post().to(debug_cleanup_handler),
            )
    })
    .bind(bind_address)?
    .run()
    .await
}

/// Handler for /api/debug/stats endpoint
/// Returns comprehensive server statistics for debugging
async fn debug_stats_handler(
    stats: web::Data<Arc<ServerStats>>,
    battle_states: web::Data<Mutex<HashMap<String, battle_handlers::BattleState>>>,
    refresh_states: web::Data<Mutex<HashMap<String, refresh_notifier::RefreshState>>>,
    process_manager: web::Data<Arc<process_manager::ProcessManager>>,
) -> impl Responder {
    // Get counts safely
    let battle_count = battle_states
        .lock()
        .map(|s| s.len())
        .unwrap_or(0);

    let refresh_count = refresh_states
        .lock()
        .map(|s| s.len())
        .unwrap_or(0);

    let process_count = process_manager.list_processes().len();

    let snapshot = stats.snapshot(battle_count, refresh_count, process_count);

    HttpResponse::Ok().json(snapshot)
}

/// Handler for /api/debug/cleanup endpoint
/// Manually triggers cleanup of old sessions (useful for debugging memory leaks)
async fn debug_cleanup_handler(
    battle_states: web::Data<Mutex<HashMap<String, battle_handlers::BattleState>>>,
    refresh_states: web::Data<Mutex<HashMap<String, refresh_notifier::RefreshState>>>,
) -> impl Responder {
    let mut cleaned = serde_json::json!({
        "battle_states_before": 0,
        "battle_states_after": 0,
        "refresh_states_before": 0,
        "refresh_states_after": 0,
    });

    // Clean battle states (keep only last 100)
    if let Ok(mut states) = battle_states.lock() {
        cleaned["battle_states_before"] = states.len().into();

        // If over limit, remove oldest (this is a simple approach)
        // In practice, you'd want timestamps on sessions
        if states.len() > 100 {
            let keys: Vec<String> = states.keys().take(states.len() - 100).cloned().collect();
            for key in keys {
                states.remove(&key);
            }
            tracing::info!("Cleaned {} old battle states", cleaned["battle_states_before"].as_u64().unwrap_or(0) - states.len() as u64);
        }

        cleaned["battle_states_after"] = states.len().into();
    }

    // Clean refresh states (keep only last 50)
    if let Ok(mut states) = refresh_states.lock() {
        cleaned["refresh_states_before"] = states.len().into();

        if states.len() > 50 {
            let keys: Vec<String> = states.keys().take(states.len() - 50).cloned().collect();
            for key in keys {
                states.remove(&key);
            }
            tracing::info!("Cleaned {} old refresh states", cleaned["refresh_states_before"].as_u64().unwrap_or(0) - states.len() as u64);
        }

        cleaned["refresh_states_after"] = states.len().into();
    }

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Cleanup completed",
        "details": cleaned
    }))
}
