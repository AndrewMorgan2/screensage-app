use actix_web::{web, HttpResponse, Responder};
use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
pub struct MoveFileRequest {
    pub from: String,
    pub to: String,
}

/// Move a file from one path to another.
/// Falls back to copy + delete when source and destination are on different filesystems.
pub async fn move_file(req: web::Json<MoveFileRequest>) -> impl Responder {
    let src = Path::new(&req.from);
    let dst = Path::new(&req.to);

    if !src.exists() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "success": false,
            "error": "Source file not found"
        }));
    }

    if !src.is_file() {
        return HttpResponse::BadRequest().json(serde_json::json!({
            "success": false,
            "error": "Source path is not a file"
        }));
    }

    // Ensure destination parent directory exists
    if let Some(parent) = dst.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": format!("Failed to create destination directory: {}", e)
            }));
        }
    }

    // Try rename first (fast, same filesystem)
    if std::fs::rename(src, dst).is_err() {
        // Cross-filesystem fallback: copy then delete
        if let Err(e) = std::fs::copy(src, dst) {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": format!("Failed to copy file: {}", e)
            }));
        }
        if let Err(e) = std::fs::remove_file(src) {
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "success": false,
                "error": format!("File copied but source could not be removed: {}", e)
            }));
        }
    }

    HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": format!("Moved to {}", dst.display())
    }))
}
