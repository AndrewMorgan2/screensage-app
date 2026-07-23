use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::Path;

const NAV_CONFIG_PATH: &str = "storage/nav_config.json";

/// (tab id, path, label) for every toggleable nav tab, in display order.
/// The "Commands" home tab is always shown and is not included here.
const NAV_TABS: &[(&str, &str, &str)] = &[
    ("images", "/images", "Media"),
    ("battle", "/battle", "Battle"),
    ("characters", "/characters", "Characters"),
    ("sageslate", "/sageslate", "SageSlate"),
    ("vtt", "/vtt", "Battlemap"),
    ("walls", "/walls", "Walls"),
    ("display", "/display", "Display"),
    ("draw", "/draw", "Draw"),
    ("rules", "/rules", "Rules"),
    ("upload", "/upload", "Upload"),
    ("wifi", "/wifi", "WiFi"),
];

/// Read which nav tabs are enabled from storage/nav_config.json.
/// Missing file or missing/invalid entries default to enabled.
fn load_enabled_tabs() -> HashMap<String, bool> {
    let mut enabled: HashMap<String, bool> = NAV_TABS.iter().map(|(id, _, _)| (id.to_string(), true)).collect();

    if let Ok(contents) = fs::read_to_string(NAV_CONFIG_PATH) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
            if let Some(tabs) = json.get("tabs").and_then(|t| t.as_object()) {
                for (id, is_enabled) in tabs {
                    if let Some(is_enabled) = is_enabled.as_bool() {
                        enabled.insert(id.clone(), is_enabled);
                    }
                }
            }
        }
    }

    enabled
}

/// Build the <li> markup for the nav bar, honoring which tabs are enabled
/// and marking the active page. The Commands (home) tab is always shown.
fn build_nav_links(active_page: &str) -> String {
    let enabled = load_enabled_tabs();

    let mut links = String::new();
    let home_active = if active_page == "home" { " active" } else { "" };
    links.push_str(&format!(r#"<li><a href="/" class="nav-link{}">Commands</a></li>"#, home_active));

    for (id, path, label) in NAV_TABS {
        if !*enabled.get(*id).unwrap_or(&true) {
            continue;
        }
        let active = if active_page == *id { " active" } else { "" };
        links.push_str(&format!(r#"<li><a href="{}" class="nav-link{}">{}</a></li>"#, path, active, label));
    }

    links
}

/// A simple template loader that handles basic template replacement
pub struct TemplateLoader {
    templates: HashMap<String, String>,
}

impl TemplateLoader {
    /// Create a new template loader, initializing the template cache
    pub fn new() -> io::Result<Self> {        
        // Load all HTML templates
        let mut templates = HashMap::new();
        
        // Load templates from files when possible, otherwise use embedded strings
        templates.insert("base".to_string(), load_template("src/static/templates/base.html")?);
        templates.insert("command_center".to_string(), load_template("src/static/templates/command_center.html")?);
        templates.insert("image_browser".to_string(), load_template("src/static/templates/image_browser.html")?);
        templates.insert("battle".to_string(), load_template("src/static/templates/battle.html")?);
        templates.insert("sageslate".to_string(), load_template("src/static/templates/sageslate.html")?);
        templates.insert("vtt".to_string(), load_template("src/static/templates/vtt.html")?);
        templates.insert("walls".to_string(), load_template("src/static/templates/walls.html")?);
        templates.insert("display".to_string(), load_template("src/static/templates/display.html")?);
        templates.insert("draw".to_string(), load_template("src/static/templates/draw.html")?);
        templates.insert("rules".to_string(), load_template("src/static/templates/rules.html")?);
        templates.insert("upload".to_string(), load_template("src/static/templates/upload.html")?);
        templates.insert("wifi".to_string(), load_template("src/static/templates/wifi.html")?);
        templates.insert("characters".to_string(), load_template("src/static/templates/characters.html")?);

        Ok(Self { templates })
    }
    
    /// Render a template with the given context
    pub fn render(&self, template_name: &str, context: HashMap<String, String>) -> String {
        let mut result = self.templates.get(template_name)
            .unwrap_or_else(|| panic!("Template not found: {}", template_name))
            .clone();
        
        // Replace all variables in the template
        for (key, value) in context {
            result = result.replace(&format!("{{{{{}}}}}", key), &value);
        }
        
        result
    }
    
    /// Render a template with the base template
    pub fn render_with_base(&self, template_name: &str, context: HashMap<String, String>, title: &str, active_page: &str) -> String {
        // First render the content template
        let content = self.render(template_name, context);
        
        // Then render the base template with the content
        let mut base_context = HashMap::new();
        base_context.insert("title".to_string(), title.to_string());
        base_context.insert("content".to_string(), content);
        
        // Build the nav bar links, honoring enabled/disabled tabs and active page
        base_context.insert("nav_links".to_string(), build_nav_links(active_page));

        let page_script = match active_page {
            "images" => r#"<script src="/static/js/image-browser.js"></script>"#,
            "battle" => r#"<script src="/static/js/battle/battle-main.js"></script>"#,
            "image-gen" => r#"<script src="/static/js/image-generator.js"></script> <script src="/static/js/image-browser.js"></script>"#,
            "sageslate" => r#"<!-- Sageslate VTT JavaScript Modules -->
            <!-- Utilities and data (no dependencies) -->
            <script src="/static/js/vtt/vtt-utils-module.js"></script>
            <script src="/static/js/vtt/vtt-element-types.js"></script>
            <!-- Supporting modules -->
            <script src="/static/js/vtt/vtt-control-generators.js"></script>
            <script src="/static/js/vtt/vtt-file-operations.js"></script>
            <!-- Core modules -->
            <script src="/static/js/vtt/vtt-preview-module.js"></script>
            <script src="/static/js/vtt/vtt-controls-module.js"></script>
            <script src="/static/js/vtt/vtt-draggable-module.js"></script>
            <!-- Initialization -->
            <script src="/static/js/vtt/vtt-initializer.js"></script>
            <!-- Backwards compatibility and extras -->
            <script src="/static/js/sageslate-jsons.js"></script>
            <script src="/static/js/image-browser.js"></script>
            <script src="/static/js/sageslate.js"></script>
            <!-- Page entry point -->
            <script src="/static/js/vtt/sageslate-main.js"></script>
        "#,
            "vtt" => r#"<!-- VTT JavaScript Modules -->
        <!-- Utilities and data (no dependencies) -->
        <script src="/static/js/vtt/vtt-utils-module.js"></script>
        <script src="/static/js/vtt/vtt-element-types.js"></script>
        <!-- Supporting modules -->
        <script src="/static/js/vtt/vtt-control-generators.js"></script>
        <script src="/static/js/vtt/vtt-file-operations.js"></script>
        <!-- Core modules -->
        <script src="/static/js/vtt/vtt-preview-module.js"></script>
        <script src="/static/js/vtt/vtt-controls-module.js"></script>
        <script src="/static/js/vtt/vtt-draggable-module.js"></script>
        <!-- Initialization -->
        <script src="/static/js/vtt/vtt-initializer.js"></script>
        <!-- Page entry point -->
        <script src="/static/js/vtt/vtt-main.js"></script>
    "#,
        "display" => r#"<!-- Display VTT JavaScript Modules -->
            <!-- Utilities and data (no dependencies) -->
            <script src="/static/js/vtt/vtt-utils-module.js"></script>
            <script src="/static/js/vtt/vtt-element-types.js"></script>
            <!-- Supporting modules -->
            <script src="/static/js/vtt/vtt-control-generators.js"></script>
            <script src="/static/js/vtt/vtt-file-operations.js"></script>
            <!-- Core modules -->
            <script src="/static/js/vtt/vtt-preview-module.js"></script>
            <script src="/static/js/vtt/vtt-controls-module.js"></script>
            <script src="/static/js/vtt/vtt-draggable-module.js"></script>
            <!-- Initialization -->
            <script src="/static/js/vtt/vtt-initializer.js"></script>
            <!-- Page entry point -->
            <script src="/static/js/vtt/display-main.js"></script>
        "#,
            "walls" => r#"<script src="/static/js/walls/walls-main.js"></script>"#,
            "draw" => r#"<script src="/static/js/draw.js"></script>"#,
            "rules" => r#"<script src="/static/js/rules.js?v=4"></script>"#,
            "characters" => r#"<script src="/static/js/characters.js"></script>"#,
            "wifi" => "", // WiFi page has inline script in template
            _ => "", // no specific script for other pages like about
            };
    
        base_context.insert("page_script".to_string(), page_script.to_string());
        
        self.render("base", base_context)
    }
}

fn load_template(path: &str) -> io::Result<String> {
    if Path::new(path).exists() {
        fs::read_to_string(path)
    } else {
        // If file doesn't exist, return embedded content instead
        match path {
           "src/static/templates/base.html" => Ok(include_str!("templates/base.html").to_string()),
            "src/static/templates/command_center.html" => Ok(include_str!("templates/command_center.html").to_string()),
            "src/static/templates/image_browser.html" => Ok(include_str!("templates/image_browser.html").to_string()),
            "src/static/templates/battle.html" => Ok(include_str!("templates/battle.html").to_string()),
            "src/static/templates/sageslate.html" => Ok(include_str!("templates/sageslate.html").to_string()),
            "src/static/templates/vtt.html" => Ok(include_str!("templates/vtt.html").to_string()),
            "src/static/templates/walls.html" => Ok(include_str!("templates/walls.html").to_string()),
            "src/static/templates/display.html" => Ok(include_str!("templates/display.html").to_string()),
            "src/static/templates/draw.html" => Ok(include_str!("templates/draw.html").to_string()),
            "src/static/templates/rules.html" => Ok(include_str!("templates/rules.html").to_string()),
            "src/static/templates/upload.html" => Ok(include_str!("templates/upload.html").to_string()),
            "src/static/templates/wifi.html" => Ok(include_str!("templates/wifi.html").to_string()),
            "src/static/templates/characters.html" => Ok(include_str!("templates/characters.html").to_string()),
            _ => Err(io::Error::new(io::ErrorKind::NotFound, format!("Template not found: {}", path))),
        }
    }
}