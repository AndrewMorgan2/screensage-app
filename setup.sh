#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────────
# ScreenSage Setup Script
# Supports: Arch Linux (primary), Debian/Ubuntu
# ──────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ──────────────────────────────────────────────────────────────────────────────
# 1. Detect distro
# ──────────────────────────────────────────────────────────────────────────────
detect_distro() {
    if command -v pacman &>/dev/null; then
        echo "arch"
    elif command -v apt-get &>/dev/null; then
        echo "debian"
    else
        echo "unknown"
    fi
}

DISTRO=$(detect_distro)
info "Detected distro: $DISTRO"

# ──────────────────────────────────────────────────────────────────────────────
# 2. System dependencies
# ──────────────────────────────────────────────────────────────────────────────
install_system_deps() {
    info "Installing system dependencies..."

    if [[ "$DISTRO" == "arch" ]]; then
        sudo pacman -Sy --needed --noconfirm \
            base-devel \
            pkg-config \
            openssl \
            python \
            python-pip \
            python-virtualenv \
            rustup

    elif [[ "$DISTRO" == "debian" ]]; then
        sudo apt-get update -qq
        sudo apt-get install -y \
            build-essential \
            pkg-config \
            libssl-dev \
            python3 \
            python3-pip \
            python3-venv \
            curl

    else
        warn "Unknown distro — skipping system package install."
        warn "Ensure you have: pkg-config, OpenSSL dev headers, Python 3, pip, venv, Rust/Cargo"
    fi

    success "System dependencies ready"
}

# ──────────────────────────────────────────────────────────────────────────────
# 3. Rust toolchain
# ──────────────────────────────────────────────────────────────────────────────
install_rust() {
    if command -v rustc &>/dev/null && command -v cargo &>/dev/null; then
        success "Rust already installed ($(rustc --version))"
        return
    fi

    info "Installing Rust via rustup..."

    if command -v rustup &>/dev/null; then
        rustup default stable
    else
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
        # shellcheck source=/dev/null
        source "$HOME/.cargo/env"
    fi

    if ! command -v cargo &>/dev/null; then
        # rustup may have installed to ~/.cargo/bin without it being in PATH yet
        export PATH="$HOME/.cargo/bin:$PATH"
    fi

    success "Rust installed ($(rustc --version))"
}

# ──────────────────────────────────────────────────────────────────────────────
# 4. Python virtual environment
# ──────────────────────────────────────────────────────────────────────────────
setup_python_env() {
    local venv_dir="$SCRIPT_DIR/python-env"

    if [[ -d "$venv_dir" && -f "$venv_dir/bin/python" ]]; then
        info "Python venv already exists, checking packages..."
    else
        info "Creating Python virtual environment..."
        python3 -m venv "$venv_dir"
        success "Python venv created at $venv_dir"
    fi

    info "Installing Python dependencies..."
    "$venv_dir/bin/pip" install --quiet --upgrade pip
    "$venv_dir/bin/pip" install --quiet pyglet watchdog Pillow numpy screeninfo

    success "Python dependencies installed"
    success "  pyglet  — $(\"$venv_dir/bin/python\" -c 'import pyglet; print(pyglet.version)')"
    success "  Pillow  — $(\"$venv_dir/bin/python\" -c 'import PIL; print(PIL.__version__)')"
}

# ──────────────────────────────────────────────────────────────────────────────
# 5. Build Rust backend
# ──────────────────────────────────────────────────────────────────────────────
build_rust() {
    info "Building ScreenSage (this will take a few minutes on first run)..."
    cd "$SCRIPT_DIR"

    if cargo build --release 2>&1; then
        success "Build complete → target/release/screen-sage"
    else
        error "Cargo build failed. Check output above."
    fi
}

# ──────────────────────────────────────────────────────────────────────────────
# 6. Verify
# ──────────────────────────────────────────────────────────────────────────────
verify() {
    info "Verifying installation..."
    local ok=true

    command -v rustc  &>/dev/null && success "rustc:   $(rustc --version)"  || { warn "rustc not found";  ok=false; }
    command -v cargo  &>/dev/null && success "cargo:   $(cargo --version)"  || { warn "cargo not found";  ok=false; }
    command -v python3 &>/dev/null && success "python3: $(python3 --version)" || { warn "python3 not found"; ok=false; }

    local venv="$SCRIPT_DIR/python-env/bin/python"
    [[ -f "$venv" ]] && success "venv:    $venv" || { warn "Python venv missing"; ok=false; }

    local binary="$SCRIPT_DIR/target/release/screen-sage"
    [[ -f "$binary" ]] && success "binary:  $binary" || { warn "Rust binary not found (build may have failed)"; ok=false; }

    if $ok; then
        echo ""
        echo -e "${GREEN}══════════════════════════════════════════${NC}"
        echo -e "${GREEN}  ScreenSage is ready to run!${NC}"
        echo -e "${GREEN}══════════════════════════════════════════${NC}"
        echo ""
        echo "  Start the server:    cargo run   (or ./target/release/screen-sage)"
        echo "  Open in browser:     http://localhost:8080"
        echo ""
        echo "  Launch a display:"
        echo "    source python-env/bin/activate"
        echo "    python ScryingGlass_pyglet/display_engine_pyglet.py <config.json>"
        echo ""
    else
        echo ""
        warn "Setup completed with warnings — check above for details."
    fi
}

# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        ScreenSage Setup Script           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

install_system_deps
install_rust
setup_python_env
build_rust
verify
