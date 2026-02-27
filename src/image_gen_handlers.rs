use actix_web::{web, HttpResponse, Responder};
use serde::{Serialize, Deserialize};
use std::path::Path;
use std::fs;
use uuid::Uuid;
use reqwest::{Client, header};
use std::io::Write;

// Path to store generated images
const GENERATED_IMAGES_DIR: &str = "./storage/ai_images";

/// Serve the image generator page
pub async fn image_generator() -> impl Responder {
    let html = crate::template_renderers::render_image_generator();
    
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}


#[derive(Serialize)]
pub struct GenerateImageResponse {
    pub success: bool,
    pub message: String,
    pub image_path: Option<String>,
    pub image_url: Option<String>,
}

// Update the generate_image function in your image_gen_handlers.rs file 
// to work without the advanced payload and headers

#[derive(Deserialize)]
pub struct GenerateImageRequest {
    pub api_key: String,
    pub endpoint: String,
    pub prompt: String,
    pub output_format: String,
}

/// Generate image from AI API
pub async fn generate_image(req: web::Json<GenerateImageRequest>) -> impl Responder {
    // Ensure the image directory exists
    if !Path::new(GENERATED_IMAGES_DIR).exists() {
        if let Err(e) = fs::create_dir_all(GENERATED_IMAGES_DIR) {
            return HttpResponse::InternalServerError().json(GenerateImageResponse {
                success: false,
                message: format!("Failed to create image directory: {}", e),
                image_path: None,
                image_url: None,
            });
        }
    }
    
    // Create a unique filename for the image
    let filename = format!("{}.{}", Uuid::new_v4(), req.output_format);
    let file_path = format!("{}/{}", GENERATED_IMAGES_DIR, filename);
    
    // Create HTTP client
    let client = Client::new();
    
    // Create headers
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::AUTHORIZATION, 
        header::HeaderValue::from_str(&format!("Bearer {}", req.api_key))
            .unwrap_or_else(|_| header::HeaderValue::from_static(""))
    );
    headers.insert(
        header::ACCEPT,
        header::HeaderValue::from_static("image/*")
    );
    
    // Create the payload with just the basics
    let payload = serde_json::json!({
        "prompt": req.prompt,
        "output_format": req.output_format,
        "aspect_ratio": "16:9"
    });
    
    // Build multipart form
    let form = reqwest::multipart::Form::new();
    
    // Add each field from the payload to the form
    let mut built_form = form;
    if let Some(obj) = payload.as_object() {
        for (key, value) in obj {
            if let Some(value_str) = value.as_str() {
                built_form = built_form.text(key.clone(), value_str.to_string());
            } else {
                built_form = built_form.text(key.clone(), value.to_string());
            }
        }
    }
    
    // Send the request
    let result = client
        .post(&req.endpoint)
        .headers(headers)
        .multipart(built_form)
        .send()
        .await;
        
    match result {
        Ok(response) => {
            let status = response.status();
            
            if status.is_success() {
                // Get the binary response
                match response.bytes().await {
                    Ok(bytes) => {
                        // Save the image to the file system
                        match fs::File::create(&file_path) {
                            Ok(mut file) => {
                                if let Err(e) = file.write_all(&bytes) {
                                    return HttpResponse::InternalServerError().json(GenerateImageResponse {
                                        success: false,
                                        message: format!("Failed to write image to file: {}", e),
                                        image_path: None,
                                        image_url: None,
                                    });
                                }
                                
                                // Create URL for the image
                                let image_url = format!("/api/image-gen/view?path={}", filename);
                                
                                HttpResponse::Ok().json(GenerateImageResponse {
                                    success: true,
                                    message: "Image generated successfully".to_string(),
                                    image_path: Some(file_path),
                                    image_url: Some(image_url),
                                })
                            },
                            Err(e) => {
                                HttpResponse::InternalServerError().json(GenerateImageResponse {
                                    success: false,
                                    message: format!("Failed to create image file: {}", e),
                                    image_path: None,
                                    image_url: None,
                                })
                            }
                        }
                    },
                    Err(e) => {
                        HttpResponse::InternalServerError().json(GenerateImageResponse {
                            success: false,
                            message: format!("Failed to read image bytes: {}", e),
                            image_path: None,
                            image_url: None,
                        })
                    }
                }
            } else {
                // Try to extract the error message from the response
                match response.text().await {
                    Ok(text) => {
                        HttpResponse::BadRequest().json(GenerateImageResponse {
                            success: false,
                            message: format!("API Error ({}): {}", status.as_u16(), text),
                            image_path: None,
                            image_url: None,
                        })
                    },
                    Err(_) => {
                        HttpResponse::BadRequest().json(GenerateImageResponse {
                            success: false,
                            message: format!("API Error: HTTP {}", status.as_u16()),
                            image_path: None,
                            image_url: None,
                        })
                    }
                }
            }
        },
        Err(e) => {
            HttpResponse::InternalServerError().json(GenerateImageResponse {
                success: false,
                message: format!("Failed to send request: {}", e),
                image_path: None,
                image_url: None,
            })
        }
    }
}
#[derive(Deserialize)]
pub struct ImagePathRequest {
    pub path: String,
}

/// Serve a generated image
pub async fn serve_generated_image(req: web::Query<ImagePathRequest>) -> impl Responder {
    let path = Path::new(GENERATED_IMAGES_DIR).join(&req.path);
    
    // Check if the file exists and is a file
    if !path.exists() || !path.is_file() {
        return HttpResponse::NotFound().body("Image not found");
    }
    
    // Read the file
    match fs::read(&path) {
        Ok(file_bytes) => {
            // Determine the content type based on file extension
            let content_type = match path.extension().and_then(|e| e.to_str()) {
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("png") => "image/png",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                Some("bmp") => "image/bmp",
                _ => "application/octet-stream",
            };
            
            HttpResponse::Ok()
                .content_type(content_type)
                .body(file_bytes)
        },
        Err(e) => {
            HttpResponse::InternalServerError().body(format!("Failed to read file: {}", e))
        }
    }
}

/// List recently generated images
pub async fn list_generated_images() -> impl Responder {
    if !Path::new(GENERATED_IMAGES_DIR).exists() {
        return HttpResponse::Ok().json(serde_json::json!({
            "images": []
        }));
    }
    
    // Read directory contents
    match fs::read_dir(GENERATED_IMAGES_DIR) {
        Ok(entries) => {
            let mut images = Vec::new();
            
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();
                    
                    // Skip if not a file
                    if !path.is_file() {
                        continue;
                    }
                    
                    // Get file metadata
                    if let Ok(metadata) = fs::metadata(&path) {
                        // Check if it's an image file
                        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                            let valid_extensions = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
                            
                            if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                                // Get filename
                                let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                                
                                // Create URL
                                let url = format!("/api/image-gen/view?path={}", filename);
                                
                                // Get creation time if available
                                let created = metadata
                                    .created()
                                    .ok()
                                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                                    .map(|duration| duration.as_secs());
                                
                                images.push(serde_json::json!({
                                    "name": filename,
                                    "path": path.to_string_lossy().to_string(),
                                    "url": url,
                                    "created": created
                                }));
                            }
                        }
                    }
                }
            }
            
            // Sort by creation time, newest first
            images.sort_by(|a, b| {
                let a_time = a.get("created").and_then(|t| t.as_u64()).unwrap_or(0);
                let b_time = b.get("created").and_then(|t| t.as_u64()).unwrap_or(0);
                b_time.cmp(&a_time)
            });
            
            // Limit to most recent 20 images
            let images = if images.len() > 20 {
                images[0..20].to_vec()
            } else {
                images
            };
            
            HttpResponse::Ok().json(serde_json::json!({
                "images": images
            }))
        },
        Err(e) => {
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to read directory: {}", e),
                "images": []
            }))
        }
    }
}
#[derive(Deserialize)]
pub struct CheckCreditsRequest {
    pub api_key: String,
}

#[derive(Serialize)]
pub struct CheckCreditsResponse {
    pub success: bool,
    pub message: String,
    pub credits: Option<f64>,
}

/// Check available credits with Stability AI
pub async fn check_credits(req: web::Json<CheckCreditsRequest>) -> impl Responder {
    // Create HTTP client
    let client = Client::new();
    
    // Create headers
    let mut headers = header::HeaderMap::new();
    headers.insert(
        header::AUTHORIZATION, 
        header::HeaderValue::from_str(&format!("Bearer {}", req.api_key))
            .unwrap_or_else(|_| header::HeaderValue::from_static(""))
    );
    
    // Send the request to Stability AI's balance endpoint
    let result = client
        .get("https://api.stability.ai/v1/user/balance")
        .headers(headers)
        .send()
        .await;
        
    match result {
        Ok(response) => {
            let status = response.status();
            
            if status.is_success() {
                // Parse the JSON response
                match response.json::<serde_json::Value>().await {
                    Ok(balance_data) => {
                        // Extract the credits amount
                        if let Some(credits) = balance_data.get("credits").and_then(|c| c.as_f64()) {
                            HttpResponse::Ok().json(CheckCreditsResponse {
                                success: true,
                                message: "Successfully retrieved credits".to_string(),
                                credits: Some(credits),
                            })
                        } else {
                            HttpResponse::Ok().json(CheckCreditsResponse {
                                success: false,
                                message: "Could not find credits in response".to_string(),
                                credits: None,
                            })
                        }
                    },
                    Err(e) => {
                        HttpResponse::InternalServerError().json(CheckCreditsResponse {
                            success: false,
                            message: format!("Failed to parse response: {}", e),
                            credits: None,
                        })
                    }
                }
            } else {
                // Try to extract the error message from the response
                match response.text().await {
                    Ok(text) => {
                        HttpResponse::BadRequest().json(CheckCreditsResponse {
                            success: false,
                            message: format!("API Error ({}): {}", status.as_u16(), text),
                            credits: None,
                        })
                    },
                    Err(_) => {
                        HttpResponse::BadRequest().json(CheckCreditsResponse {
                            success: false,
                            message: format!("API Error: HTTP {}", status.as_u16()),
                            credits: None,
                        })
                    }
                }
            }
        },
        Err(e) => {
            HttpResponse::InternalServerError().json(CheckCreditsResponse {
                success: false,
                message: format!("Failed to send request: {}", e),
                credits: None,
            })
        }
    }
}
