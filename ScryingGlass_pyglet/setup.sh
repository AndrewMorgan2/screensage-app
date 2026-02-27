#!/bin/bash
# Setup script for ScryingGlass Pyglet display engine

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$PROJECT_ROOT/python-env"

echo "Setting up ScryingGlass Pyglet..."

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Ensure pip is available
echo "Ensuring pip is installed..."
"$VENV_DIR/bin/python3" -m ensurepip --upgrade

# Install dependencies
echo "Installing dependencies..."
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"

echo ""
echo "Setup complete! Run the display engine with:"
echo "  $VENV_DIR/bin/python3 $SCRIPT_DIR/display_engine_pyglet.py <config.json>"
