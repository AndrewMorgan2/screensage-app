use actix_web::{HttpResponse, Responder};
use std::fs;
use std::path::Path;

pub const RULES_DIR: &str = "./storage/rules";

/// Serve the rules assistant page
pub async fn rules_render() -> impl Responder {
    let html = crate::template_renderers::render_rules();
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

/// Return a sorted list of available rule system names (filename without .json)
pub async fn list_rule_systems() -> impl Responder {
    match fs::read_dir(Path::new(RULES_DIR)) {
        Ok(entries) => {
            let mut systems: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.ends_with(".json") {
                        Some(name[..name.len() - 5].to_string())
                    } else {
                        None
                    }
                })
                .collect();
            systems.sort();
            HttpResponse::Ok().json(systems)
        }
        Err(e) => HttpResponse::InternalServerError().json(serde_json::json!({
            "error": format!("Failed to list rule systems: {}", e)
        })),
    }
}
