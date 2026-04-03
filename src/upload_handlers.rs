use actix_web::{web, Error, HttpResponse};
use futures_util::stream::StreamExt;
use serde::{Serialize};
use std::io::Write;
use std::path::Path;
use uuid::Uuid;

// Constants for file paths
pub const UPLOAD_DIR: &str = "/home/amorgan/Github/Upload";
pub const UPLOAD_OVERLAY_DIR: &str = "overlays";

// Response types
#[derive(Serialize)]
pub struct ImageUploadResponse {
    success: bool,
    message: String,
    path: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

// #[derive(Deserialize)]
// pub struct ImageDimensions {
//     width: u32,
//     height: u32,
// }

// Upload image handler - adjusted for compatible paths
pub async fn upload_image(
    mut payload: actix_web::web::Payload,
) -> Result<HttpResponse, Error> {
    println!("========================================");
    println!("📥 UPLOAD REQUEST RECEIVED");
    println!("========================================");

    // Ensure upload directory exists
    println!("🔍 Checking upload directory: {}", UPLOAD_DIR);
    ensure_upload_directory(UPLOAD_DIR)?;
    println!("✅ Upload directory exists/created");

    // Generate a unique filename
    let uuid = Uuid::new_v4();
    let filename = format!("{}.png", uuid); // Assuming PNG for simplicity
    let filepath = format!("{}/{}", UPLOAD_DIR, filename);

    println!("📝 Generated filename: {}", filename);
    println!("💾 Full file path: {}", filepath);

    // Create file
    println!("🔨 Creating file...");
    let mut file = std::fs::File::create(&filepath)
        .map_err(|e| {
            println!("❌ ERROR creating file: {}", e);
            actix_web::error::ErrorInternalServerError(e)
        })?;
    println!("✅ File created successfully");

    // Read the payload and write to file
    println!("📡 Reading payload data...");
    let mut bytes = web::BytesMut::new();
    let mut chunk_count = 0;
    while let Some(item) = payload.next().await {
        let item = item.map_err(|e| {
            println!("❌ ERROR reading payload: {}", e);
            actix_web::error::ErrorInternalServerError(e)
        })?;
        chunk_count += 1;
        bytes.extend_from_slice(&item);
    }
    println!("✅ Payload read complete - {} chunks, {} total bytes", chunk_count, bytes.len());

    // Write file
    println!("💾 Writing {} bytes to file...", bytes.len());
    file.write_all(&bytes)
        .map_err(|e| {
            println!("❌ ERROR writing file: {}", e);
            actix_web::error::ErrorInternalServerError(e)
        })?;
    println!("✅ File written successfully");

    // Generate compatible path format for your existing image handler
    // This path will work with your /api/images/view?path= endpoint
    let file_path = format!("{}/{}", UPLOAD_DIR, filename);

    println!("🎉 Upload complete!");
    println!("   Path: {}", file_path);
    println!("   Size: {} bytes", bytes.len());
    println!("========================================");

    // For now, we'll return mock dimensions
    // In a production app, you might want to use the image crate to get real dimensions
    let response = ImageUploadResponse {
        success: true,
        message: "Image uploaded successfully".to_string(),
        path: Some(file_path),
        width: Some(800),  // Mock value
        height: Some(600), // Mock value
    };

    Ok(HttpResponse::Ok().json(response))
}

// Upload overlay handler - adjusted for compatible paths
pub async fn upload_overlay(
    mut payload: actix_web::web::Payload,
) -> Result<HttpResponse, Error> {
    println!("Received overlay upload request");
    
    // Ensure upload directory exists - create the directory within images
    let overlay_dir = format!("{}/{}", UPLOAD_DIR, UPLOAD_OVERLAY_DIR);
    ensure_upload_directory(&overlay_dir)?;
    
    // Generate a unique filename
    let uuid = Uuid::new_v4();
    let filename = format!("{}.png", uuid); // Assuming PNG for simplicity
    let filepath = format!("{}/{}", overlay_dir, filename);
    
    println!("Saving overlay to: {}", filepath);
    
    // Create file
    let mut file = std::fs::File::create(&filepath)
        .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;
    
    // Read the payload and write to file
    let mut bytes = web::BytesMut::new();
    while let Some(item) = payload.next().await {
        let item = item.map_err(|e| actix_web::error::ErrorInternalServerError(e))?;
        bytes.extend_from_slice(&item);
    }
    
    // Write file
    file.write_all(&bytes)
        .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;
    
    // Generate compatible path format for your existing image handler
    let file_path = format!("{}/{}/{}", UPLOAD_DIR, UPLOAD_OVERLAY_DIR, filename);
    
    // Return response
    let response = ImageUploadResponse {
        success: true,
        message: "Overlay uploaded successfully".to_string(),
        path: Some(file_path),
        width: Some(800),  // Mock value
        height: Some(600), // Mock value
    };
    
    Ok(HttpResponse::Ok().json(response))
}

// Helper function to ensure directories exist
fn ensure_upload_directory(dir: &str) -> Result<(), actix_web::Error> {
    if !Path::new(dir).exists() {
        std::fs::create_dir_all(dir).map_err(|e| {
            println!("Failed to create directory {}: {}", dir, e);
            actix_web::error::ErrorInternalServerError(format!("Failed to create directory: {}", e))
        })?;
    }
    Ok(())
}