// template_renderers.rs
use crate::template_loader::TemplateLoader;
use crate::image_handlers::{MEDIA_BASE_DIR, BATTLEMAP_BASE_DIR};
use crate::sageslate_handlers::MEDIA_BASE_DIR as SAGESLATE_MEDIA_BASE_DIR;
use std::collections::HashMap;

// A shared template loader instance
lazy_static::lazy_static! {
    static ref TEMPLATE_LOADER: TemplateLoader = TemplateLoader::new().expect("Failed to initialize template loader");
}

/// Render the command center page
pub fn render_command_center() -> String {
    // Create context for the command center template
    let context = HashMap::new();
    
    // Render the command center template with the base template
    TEMPLATE_LOADER.render_with_base("command_center", context, "Command Center", "home")
}

/// Render the battle tracker page
pub fn render_battle() -> String {
    // Create context for the battle template
    let context = HashMap::new();
    
    // Render the battle template with the base template
    TEMPLATE_LOADER.render_with_base("battle", context, "Combat Tracker", "battle")
}

/// Render the image browser page
pub fn render_image_browser() -> String {
    // Create context for the image browser template
    let mut context = HashMap::new();
    context.insert("MEDIA_BASE_DIR".to_string(), MEDIA_BASE_DIR.to_string());
    context.insert("BATTLEMAP_BASE_DIR".to_string(), BATTLEMAP_BASE_DIR.to_string());
    
    // Render the image browser template with the base template
    TEMPLATE_LOADER.render_with_base("image_browser", context, "Media Browser", "images")
}

/// Render the SageSlate page
pub fn render_sageslate() -> String {
    let mut context = HashMap::new();
    context.insert("MEDIA_BASE_DIR".to_string(), SAGESLATE_MEDIA_BASE_DIR.to_string());
    
    TEMPLATE_LOADER.render_with_base("sageslate", context, "SageSlate", "sageslate")
}

/// Render the VTT page
pub fn render_vtt() -> String {
    // Create empty context since vtt page doesn't need variable replacement
    let context = HashMap::new();
    
    // Render the vtt template with the base template
    TEMPLATE_LOADER.render_with_base("vtt", context, "VTT", "vtt")
}

pub fn render_display() -> String {
    // Create empty context since vtt page doesn't need variable replacement
    let context = HashMap::new();

    // Render the vtt template with the base template
    TEMPLATE_LOADER.render_with_base("display", context, "Display", "display")
}

/// Render the Draw page
pub fn render_draw() -> String {
    let context = HashMap::new();
    TEMPLATE_LOADER.render_with_base("draw", context, "Draw", "draw")
}

/// Render the Upload page
pub fn render_upload() -> String {
    // Create empty context since upload page doesn't need variable replacement
    let context = HashMap::new();

    // Render the upload template with the base template
    TEMPLATE_LOADER.render_with_base("upload", context, "Upload", "upload")
}

/// Render the WiFi Manager page
pub fn render_wifi() -> String {
    // Create empty context since wifi page doesn't need variable replacement
    let context = HashMap::new();

    // Render the wifi template with the base template
    TEMPLATE_LOADER.render_with_base("wifi", context, "WiFi Manager", "wifi")
}