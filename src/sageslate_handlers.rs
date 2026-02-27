use actix_web::{HttpResponse, Responder};

// Base directory for media files - now public so it can be accessed from templates
pub const MEDIA_BASE_DIR: &str = "../DnD_Images/eink_images";

/// Serve the SageSlate page
pub async fn sageslate() -> impl Responder {
    let html = crate::template_renderers::render_sageslate();
    
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}
