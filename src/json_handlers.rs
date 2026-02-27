use actix_web::{web, HttpResponse, Responder};
use serde::{Deserialize};
use std::fs;
use std::path::Path;

#[derive(Deserialize)]
pub struct ReadParams {
    path: String,
}

#[derive(Deserialize)]
pub struct SaveParams {
    path: String,
    content: String,
}

pub async fn read_json(query: web::Query<ReadParams>) -> impl Responder {
    let file_path = &query.path;
    
    // Check if the file exists
    if !Path::new(file_path).exists() {
        return HttpResponse::NotFound().body(format!("File not found: {}", file_path));
    }
    
    // Read the file content
    match fs::read_to_string(file_path) {
        Ok(content) => {
            // Validate JSON format
            match serde_json::from_str::<serde_json::Value>(&content) {
                Ok(json_value) => HttpResponse::Ok().json(json_value),
                Err(e) => HttpResponse::BadRequest().body(format!("Invalid JSON format: {}", e)),
            }
        },
        Err(e) => HttpResponse::InternalServerError().body(format!("Failed to read file: {}", e)),
    }
}

pub async fn save_json(json: web::Json<SaveParams>) -> impl Responder {
    let file_path = &json.path;
    let content = &json.content;
    
    // Validate JSON format
    match serde_json::from_str::<serde_json::Value>(content) {
        Ok(_) => {
            // Write content to file
            match fs::write(file_path, content) {
                Ok(_) => HttpResponse::Ok().body("File saved successfully"),
                Err(e) => HttpResponse::InternalServerError().body(format!("Failed to save file: {}", e)),
            }
        },
        Err(e) => HttpResponse::BadRequest().body(format!("Invalid JSON format: {}", e)),
    }
}