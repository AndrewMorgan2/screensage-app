use actix_web::{ HttpResponse, Responder};

/// Serve the media browser page
pub async fn vtt_render() -> impl Responder {
    let html = crate::template_renderers::render_vtt();
    
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}