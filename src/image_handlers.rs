use actix_web::{web, HttpResponse, Responder};
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::{PathBuf};

// Base directory for media files - now public so it can be accessed from templates
pub const MEDIA_BASE_DIR: &str = "../DnD_Images";
pub const BATTLEMAP_BASE_DIR: &str = "/media/jp19060/Expansion/content";

#[derive(Serialize, Deserialize)]
pub struct FolderItem {
    name: String,
    path: String,
    is_dir: bool,
    file_type: String,
}

#[derive(Serialize, Deserialize)]
pub struct ListResponse {
    items: Vec<FolderItem>,
    current_path: String,
}

#[derive(Serialize, Deserialize)]
pub struct DirectoryRequest {
    path: String,
}

#[derive(Serialize, Deserialize)]
pub struct SearchRequest {
    path: String,
    query: String,
}

/// Serve the media browser page
pub async fn image_browser() -> impl Responder {
    let html = crate::template_renderers::render_image_browser();
    
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

/// List directories and files at any path
pub async fn list_directory(req: web::Query<DirectoryRequest>) -> impl Responder {
    // Get the path from the query parameter
    let directory_path = &req.path;
    
    // println!("Requested directory: {}", directory_path);
    
    // Create a PathBuf from the provided path
    let fs_path = PathBuf::from(directory_path);
    
    // Check if the path exists and is a directory
    if !fs_path.exists() {
        println!("Path not found: {:?}", fs_path);
        return HttpResponse::NotFound().json(serde_json::json!({
            "error": "Path not found",
            "path": directory_path
        }));
    }
    
    if !fs_path.is_dir() {
        println!("Path is not a directory: {:?}", fs_path);
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Path is not a directory",
            "path": directory_path
        }));
    }
    
    // Get the parent directory if it exists
    let parent_path = fs_path.parent().map(|p| p.to_string_lossy().to_string());
    
    // Read directory contents
    match fs::read_dir(&fs_path) {
        Ok(entries) => {
            let mut items = Vec::new();
            
            // Add parent directory option if not at root
            if let Some(parent) = parent_path {
                items.push(FolderItem {
                    name: "..".to_string(),
                    path: parent,
                    is_dir: true,
                    file_type: "directory".to_string(),
                });
            }
            
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();

                    // Use metadata() which follows symlinks to determine if it's a directory
                    let is_dir = match fs::metadata(&path) {
                        Ok(metadata) => metadata.is_dir(),
                        Err(_) => {
                            // If we can't read metadata (broken symlink, permission issue), skip
                            continue;
                        }
                    };
                    
                    // Get the entry path as a string
                    let entry_path = path.to_string_lossy().to_string();
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                    
                    // For files, filter to include only image and video files
                    if !is_dir {
                        if let Some(ext) = path.extension() {
                            let ext_str = ext.to_string_lossy().to_lowercase();
                            // Images
                            let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "json"];
                            // Videos
                            let video_exts = ["mp4", "webm", "ogg", "mov", "avi", "mkv", "flv"];
                            
                            if !image_exts.contains(&ext_str.as_str()) && !video_exts.contains(&ext_str.as_str()) {
                                continue;
                            }
                        } else {
                            continue;  // Skip files without extension
                        }
                    }
                    
                    // Set file type for the UI
                    let file_type_ui = if is_dir {
                        "directory".to_string()
                    } else if let Some(ext) = path.extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if ["mp4", "webm", "ogg", "mov", "avi", "mkv", "flv"].contains(&ext_str.as_str()) {
                            "video".to_string()
                        } else {
                            "image".to_string()
                        }
                    } else {
                        "unknown".to_string()
                    };
                    
                    items.push(FolderItem {
                        name: file_name,
                        path: entry_path,
                        is_dir,
                        file_type: file_type_ui,
                    });
                }
            }
            
            // Sort items: directories first, then files, both alphabetically
            items.sort_by(|a, b| {
                // Always put parent directory (..) first
                if a.name == ".." {
                    return std::cmp::Ordering::Less;
                }
                if b.name == ".." {
                    return std::cmp::Ordering::Greater;
                }
                
                match (a.is_dir, b.is_dir) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
                }
            });
            
            HttpResponse::Ok().json(ListResponse {
                items,
                current_path: directory_path.clone(),
            })
        },
        Err(e) => {
            println!("Error reading directory: {}", e);
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to read directory: {}", e),
                "path": directory_path
            }))
        }
    }
}

/// Helper function to recursively search for media files
fn search_directory_recursive(
    base_path: &PathBuf,
    search_query: &str,
    items: &mut Vec<FolderItem>,
    max_depth: usize,
    current_depth: usize,
) {
    if current_depth > max_depth {
        return;
    }

    let search_lower = search_query.to_lowercase();

    match fs::read_dir(base_path) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let path = entry.path();

                    // Use metadata() which follows symlinks
                    let is_dir = match fs::metadata(&path) {
                        Ok(metadata) => metadata.is_dir(),
                        Err(_) => continue, // Skip if can't read metadata
                    };

                    let entry_path = path.to_string_lossy().to_string();
                    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

                    // Check if the file/folder name contains the search query
                    if !file_name.to_lowercase().contains(&search_lower) {
                        // If it's a directory, still recurse into it
                        if is_dir {
                            search_directory_recursive(&path, search_query, items, max_depth, current_depth + 1);
                        }
                        continue;
                    }

                    // For files, filter to include only image and video files
                    if !is_dir {
                        if let Some(ext) = path.extension() {
                            let ext_str = ext.to_string_lossy().to_lowercase();
                            let image_exts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "json"];
                            let video_exts = ["mp4", "webm", "ogg", "mov", "avi", "mkv", "flv"];

                            if !image_exts.contains(&ext_str.as_str()) && !video_exts.contains(&ext_str.as_str()) {
                                continue;
                            }
                        } else {
                            continue; // Skip files without extension
                        }
                    }

                    // Set file type for the UI
                    let file_type_ui = if is_dir {
                        "directory".to_string()
                    } else if let Some(ext) = path.extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if ["mp4", "webm", "ogg", "mov", "avi", "mkv", "flv"].contains(&ext_str.as_str()) {
                            "video".to_string()
                        } else {
                            "image".to_string()
                        }
                    } else {
                        "unknown".to_string()
                    };

                    items.push(FolderItem {
                        name: file_name,
                        path: entry_path,
                        is_dir,
                        file_type: file_type_ui,
                    });

                    // Recurse into subdirectories
                    if is_dir {
                        search_directory_recursive(&path, search_query, items, max_depth, current_depth + 1);
                    }
                }
            }
        },
        Err(_) => {
            // Silently skip directories we can't read
        }
    }
}

/// Search for media files recursively
pub async fn search_media(req: web::Query<SearchRequest>) -> impl Responder {
    let directory_path = &req.path;
    let search_query = &req.query;

    println!("Searching in directory: {} for query: {}", directory_path, search_query);

    // Create a PathBuf from the provided path
    let fs_path = PathBuf::from(directory_path);

    // Check if the path exists and is a directory
    if !fs_path.exists() {
        println!("Path not found: {:?}", fs_path);
        return HttpResponse::NotFound().json(serde_json::json!({
            "error": "Path not found",
            "path": directory_path
        }));
    }

    if !fs_path.is_dir() {
        println!("Path is not a directory: {:?}", fs_path);
        return HttpResponse::BadRequest().json(serde_json::json!({
            "error": "Path is not a directory",
            "path": directory_path
        }));
    }

    // If search query is empty, return empty results
    if search_query.trim().is_empty() {
        return HttpResponse::Ok().json(ListResponse {
            items: Vec::new(),
            current_path: directory_path.clone(),
        });
    }

    let mut items = Vec::new();

    // Search recursively with a max depth of 10 to prevent infinite loops
    search_directory_recursive(&fs_path, search_query, &mut items, 10, 0);

    // Sort items: directories first, then files, both alphabetically
    items.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    println!("Found {} items matching '{}'", items.len(), search_query);

    HttpResponse::Ok().json(ListResponse {
        items,
        current_path: directory_path.clone(),
    })
}

/// Serve a media file (image or video)
pub async fn serve_media(req: web::Query<DirectoryRequest>) -> impl Responder {
    let path = &req.path;
    
    // Create a PathBuf from the provided path
    let fs_path = PathBuf::from(path);
    
    println!("Serving media: {:?}", fs_path);
    
    // Check if the file exists and is a file
    if !fs_path.exists() || !fs_path.is_file() {
        return HttpResponse::NotFound().body("File not found");
    }
    
    // Read the file
    match fs::read(&fs_path) {
        Ok(file_bytes) => {
            // Determine the content type based on file extension
            let content_type = match fs_path.extension().and_then(|e| e.to_str()) {
                // Images
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("png") => "image/png",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                Some("bmp") => "image/bmp",
                // Videos
                Some("mp4") => "video/mp4",
                Some("webm") => "video/webm",
                Some("ogg") => "video/ogg",
                Some("mov") => "video/quicktime",
                Some("avi") => "video/x-msvideo",
                Some("mkv") => "video/x-matroska",
                Some("flv") => "video/x-flv",
                _ => "application/octet-stream",
            };
            
            HttpResponse::Ok()
                .content_type(content_type)
                .body(file_bytes)
        },
        Err(e) => {
            println!("Error reading file: {}", e);
            HttpResponse::InternalServerError().body(format!("Failed to read file: {}", e))
        }
    }
}

/// Execute a command on a media file
pub async fn display(req: web::Json<crate::models::CommandRequest>) -> impl Responder {
    // Process the command here
    // The command is expected to have the media path embedded in its arguments
    
    println!("Executing media command: {} with args: {:?}", req.command, req.args);
    
    // Create command object
    let mut cmd = std::process::Command::new(&req.command);
    
    // Add arguments if provided
    if let Some(args) = &req.args {
        cmd.args(args);
    }
    
    // Execute the command
    let output = match cmd.output() {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            
            crate::models::CommandResult {
                success: output.status.success(),
                stdout,
                stderr,
                exit_code: output.status.code(),
            }
        },
        Err(e) => {
            crate::models::CommandResult {
                success: false,
                stdout: String::new(),
                stderr: format!("Failed to execute command: {}", e),
                exit_code: None,
            }
        }
    };
    
    HttpResponse::Ok().json(output)
}
