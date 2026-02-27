use actix_web::{web, HttpResponse, Responder};
use serde::{Serialize, Deserialize};
use std::sync::Mutex;
use std::collections::HashMap;

/// Serve the battle tracker page
pub async fn battle_tracker() -> impl Responder {
    let html = crate::template_renderers::render_battle();
    
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

/// Model for a combatant
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

// Update the BattleState struct to include the new combatantText field
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct BattleState {
    pub combatants: Vec<Combatant>,
    pub current_turn: i32,
    pub round: i32,
    pub active_combatant_id: Option<String>,
    pub notes: Option<String>,
    pub combatant_text: Option<String>,
}

// Shared state for battle tracking
type BattleStateData = web::Data<Mutex<HashMap<String, BattleState>>>;

/// Save battle state
#[derive(Deserialize)]
pub struct SaveBattleRequest {
    pub session_id: String,
    pub state: BattleState,
}

/// Get battle state
#[derive(Deserialize)]
pub struct GetBattleRequest {
    pub session_id: String,
}

/// Save battle state API
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

/// Get battle state API
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

/// Delete battle state API
pub async fn delete_battle_state(
    req: web::Query<GetBattleRequest>,
    battle_states: BattleStateData,
) -> impl Responder {
    let mut states = battle_states.lock().unwrap();
    
    if states.remove(&req.session_id).is_some() {
        HttpResponse::Ok().json(serde_json::json!({
            "success": true,
            "message": "Battle state deleted successfully"
        }))
    } else {
        HttpResponse::NotFound().json(serde_json::json!({
            "success": false,
            "message": "Battle state not found"
        }))
    }
}