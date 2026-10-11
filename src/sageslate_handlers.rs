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


/// Serve the Daggerheart character builder page
pub async fn daggerheart() -> impl Responder {
    let html = crate::template_renderers::render_daggerheart();

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}

/// Serve the DaggerHeart page (SageSlate with character card controls)
pub async fn character_daggerheart() -> impl Responder {
    let html = crate::template_renderers::render_character_daggerheart();

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}
