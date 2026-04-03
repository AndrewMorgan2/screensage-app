use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::ws_handler::WsBroadcast;

#[derive(Clone, Serialize, Deserialize)]
pub struct RefreshState {
    pub timestamp: u64,
    pub source: String,
}

pub type RefreshStates = Mutex<HashMap<String, RefreshState>>;

/// Trigger a refresh for a specific target (vtt or display)
#[derive(Deserialize)]
pub struct TriggerRefreshRequest {
    pub target: String,
    pub source: Option<String>,
}

pub async fn trigger_refresh(
    data: web::Data<RefreshStates>,
    ws_tx: web::Data<WsBroadcast>,
    req: web::Json<TriggerRefreshRequest>,
) -> impl Responder {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let state = RefreshState {
        timestamp,
        source: req.source.clone().unwrap_or_else(|| "unknown".to_string()),
    };

    let mut states = data.lock().unwrap();
    states.insert(req.target.clone(), state.clone());

    tracing::info!(
        target = %req.target,
        source = %state.source,
        timestamp = %timestamp,
        "Refresh triggered"
    );

    // Broadcast to all connected WebSocket clients
    let event = serde_json::json!({
        "type": "refresh",
        "target": req.target,
        "timestamp": timestamp,
        "source": state.source
    }).to_string();
    // Ignore send errors — no clients connected is fine
    let _ = ws_tx.send(event);

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "timestamp": timestamp,
        "target": req.target
    }))
}

/// Check if a refresh is needed for a specific target
#[derive(Deserialize)]
pub struct CheckRefreshQuery {
    pub target: String,
    pub last_check: Option<u64>,
}

pub async fn check_refresh(
    data: web::Data<RefreshStates>,
    query: web::Query<CheckRefreshQuery>,
) -> impl Responder {
    let states = data.lock().unwrap();

    if let Some(state) = states.get(&query.target) {
        let needs_refresh = query
            .last_check
            .map(|last| state.timestamp > last)
            .unwrap_or(true);

        HttpResponse::Ok().json(serde_json::json!({
            "needs_refresh": needs_refresh,
            "timestamp": state.timestamp,
            "source": state.source
        }))
    } else {
        HttpResponse::Ok().json(serde_json::json!({
            "needs_refresh": false,
            "timestamp": 0
        }))
    }
}
