use actix_web::{web, HttpResponse, Responder};
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const CHAR_DIR: &str = "storage/kindle_characters";
const STATIC_DIR: &str = "static/kindle";
const DEFAULT_CHAR: &str = "grix";

static WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
pub struct CharQuery {
    char: Option<String>,
}

#[derive(Deserialize)]
pub struct HpPayload {
    delta: Option<i64>,
}

fn is_valid_char_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

fn char_path(id: &str) -> PathBuf {
    Path::new(CHAR_DIR).join(format!("{id}.json"))
}

fn load_character(id: &str) -> std::io::Result<Value> {
    let data = fs::read_to_string(char_path(id))?;
    Ok(serde_json::from_str(&data).unwrap_or(json!({})))
}

fn save_character(id: &str, character: &Value) {
    if let Ok(data) = serde_json::to_string_pretty(character) {
        let _ = fs::write(char_path(id), data);
    }
}

fn is_enabled(v: &Value) -> bool {
    v.get("enabled").and_then(|e| e.as_bool()).unwrap_or(true)
}

fn list_characters(include_disabled: bool) -> Vec<Value> {
    let mut paths: Vec<PathBuf> = fs::read_dir(CHAR_DIR)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().map(|e| e == "json").unwrap_or(false))
                .collect()
        })
        .unwrap_or_default();
    paths.sort();

    paths
        .into_iter()
        .filter_map(|path| {
            let data = fs::read_to_string(&path).ok()?;
            let v: Value = serde_json::from_str(&data).ok()?;
            if !include_disabled && !is_enabled(&v) {
                return None;
            }
            let id = path.file_stem()?.to_string_lossy().to_string();
            Some(json!({
                "id": id,
                "name": v.get("name").cloned().unwrap_or_else(|| json!(id)),
                "class": v.get("class").cloned().unwrap_or_else(|| json!("")),
                "level": v.get("level").cloned().unwrap_or_else(|| json!("")),
                "hp": v.get("hp").cloned().unwrap_or(Value::Null),
                "enabled": is_enabled(&v),
            }))
        })
        .collect()
}

fn serve_page(name: &str) -> HttpResponse {
    let path = Path::new(STATIC_DIR).join(name);
    match fs::read_to_string(&path) {
        Ok(body) => HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(body),
        Err(_) => HttpResponse::NotFound().body("Not Found"),
    }
}

pub async fn character_page() -> impl Responder {
    serve_page("index.html")
}

pub async fn status_page() -> impl Responder {
    serve_page("status.html")
}

pub async fn characters_admin_page() -> impl Responder {
    let html = crate::template_renderers::render_characters_admin();
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

pub async fn list_characters_api() -> impl Responder {
    HttpResponse::Ok().json(list_characters(false))
}

pub async fn list_characters_admin_api() -> impl Responder {
    HttpResponse::Ok().json(list_characters(true))
}

pub async fn toggle_character(path: web::Path<String>) -> impl Responder {
    let char_id = path.into_inner();
    if !is_valid_char_id(&char_id) {
        return HttpResponse::BadRequest().json(json!({"error": "invalid char id"}));
    }

    let _guard = WRITE_LOCK.lock().unwrap();

    let mut character = match load_character(&char_id) {
        Ok(c) => c,
        Err(_) => {
            return HttpResponse::NotFound()
                .json(json!({"error": format!("unknown character '{char_id}'")}))
        }
    };

    let currently_enabled = is_enabled(&character);
    character["enabled"] = json!(!currently_enabled);
    save_character(&char_id, &character);

    HttpResponse::Ok().json(json!({"id": char_id, "enabled": !currently_enabled}))
}

pub async fn get_character(query: web::Query<CharQuery>) -> impl Responder {
    let char_id = query.char.clone().unwrap_or_else(|| DEFAULT_CHAR.to_string());
    if !is_valid_char_id(&char_id) {
        return HttpResponse::BadRequest().json(json!({"error": "invalid char id"}));
    }
    match load_character(&char_id) {
        Ok(c) => HttpResponse::Ok().json(c),
        Err(_) => HttpResponse::NotFound()
            .json(json!({"error": format!("unknown character '{char_id}'")})),
    }
}

pub async fn update_hp(query: web::Query<CharQuery>, payload: web::Json<HpPayload>) -> impl Responder {
    let char_id = query.char.clone().unwrap_or_else(|| DEFAULT_CHAR.to_string());
    if !is_valid_char_id(&char_id) {
        return HttpResponse::BadRequest().json(json!({"error": "invalid char id"}));
    }

    let _guard = WRITE_LOCK.lock().unwrap();

    let mut character = match load_character(&char_id) {
        Ok(c) => c,
        Err(_) => {
            return HttpResponse::NotFound()
                .json(json!({"error": format!("unknown character '{char_id}'")}))
        }
    };

    let delta = payload.delta.unwrap_or(0);
    if let Some(hp) = character.get_mut("hp") {
        let max = hp.get("max").and_then(|m| m.as_i64()).unwrap_or(0);
        let current = hp.get("current").and_then(|c| c.as_i64()).unwrap_or(0);
        hp["current"] = json!((current + delta).clamp(0, max));
    }
    save_character(&char_id, &character);
    HttpResponse::Ok().json(character)
}

pub async fn update_ability(
    query: web::Query<CharQuery>,
    path: web::Path<(String, String)>,
) -> impl Responder {
    let char_id = query.char.clone().unwrap_or_else(|| DEFAULT_CHAR.to_string());
    if !is_valid_char_id(&char_id) {
        return HttpResponse::BadRequest().json(json!({"error": "invalid char id"}));
    }

    let (ability_id, action) = path.into_inner();

    let _guard = WRITE_LOCK.lock().unwrap();

    let mut character = match load_character(&char_id) {
        Ok(c) => c,
        Err(_) => {
            return HttpResponse::NotFound()
                .json(json!({"error": format!("unknown character '{char_id}'")}))
        }
    };

    let found = character
        .get_mut("abilities")
        .and_then(|a| a.as_array_mut())
        .and_then(|abilities| {
            abilities
                .iter_mut()
                .find(|a| a.get("id").and_then(|i| i.as_str()) == Some(ability_id.as_str()))
        });

    match found {
        Some(ability) => {
            if let Some(uses) = ability.get_mut("uses") {
                if !uses.is_null() {
                    let max = uses.get("max").and_then(|m| m.as_i64()).unwrap_or(0);
                    let current = uses.get("current").and_then(|c| c.as_i64()).unwrap_or(0);
                    match action.as_str() {
                        "use" => uses["current"] = json!((current - 1).max(0)),
                        "reset" => uses["current"] = json!(max),
                        _ => {}
                    }
                }
            }
            save_character(&char_id, &character);
            HttpResponse::Ok().json(character)
        }
        None => HttpResponse::NotFound().json(json!({"error": "unknown ability"})),
    }
}
