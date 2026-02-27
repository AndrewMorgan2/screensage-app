use actix_web::{HttpResponse, Responder};

/// Serve the draw page
pub async fn draw_render() -> impl Responder {
    let html = crate::template_renderers::render_draw();

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(html)
}
