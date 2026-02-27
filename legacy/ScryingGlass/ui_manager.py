#!/usr/bin/env python3
"""
UI Manager Module
Handles UI overlay elements like FPS counter and debug information.
"""
import os
import pygame


class UIManager:
    """
    Manages user interface overlay elements.
    """
    
    def __init__(self):
        """Initialize UI manager."""
        self.font_large = None
        self.font_medium = None
        self.font_small = None
        self.show_debug = False
    
    def init_fonts(self):
        """Initialize pygame fonts."""
        try:
            self.font_large = pygame.font.Font(None, 36)
            self.font_medium = pygame.font.Font(None, 24)
            self.font_small = pygame.font.Font(None, 20)
        except pygame.error:
            # Fallback to default font
            self.font_large = pygame.font.Font(None, 36)
            self.font_medium = pygame.font.Font(None, 24)
            self.font_small = pygame.font.Font(None, 20)
    
    def draw_ui_info(self, screen, clock, config_path, element_renderer=None):
        """
        Draw UI information overlay (optional debug info).
        
        Args:
            screen (pygame.Surface): The pygame screen surface
            clock (pygame.time.Clock): Pygame clock for FPS calculation
            config_path (str): Path to configuration file
            element_renderer: Optional element renderer for additional stats
        """
        if not self.show_debug:
            return
        
        if not self.font_large:
            self.init_fonts()
        
        y_offset = 10
        
        # FPS counter
        fps_text = self.font_large.render(
            f"FPS: {int(clock.get_fps())}", 
            True, 
            (255, 255, 255)
        )
        screen.blit(fps_text, (10, y_offset))
        y_offset += 40
        
        # File watching status
        if config_path:
            watch_text = self.font_medium.render(
                f"📁 Watching: {os.path.basename(config_path)}", 
                True, 
                (200, 200, 200)
            )
            screen.blit(watch_text, (10, y_offset))
            y_offset += 30
        
        # SVG cache stats (if available)
        if element_renderer and hasattr(element_renderer, 'svg_renderer'):
            svg_stats = element_renderer.svg_renderer.get_cache_stats()
            if svg_stats['cache_size'] > 0:
                svg_text = self.font_small.render(
                    f"SVG Cache: {svg_stats['cache_size']}/{svg_stats['max_cache_size']} "
                    f"({svg_stats['hit_rate']:.1f}% hit rate)",
                    True, 
                    (150, 255, 150)
                )
                screen.blit(svg_text, (10, y_offset))
                y_offset += 25
    
    def toggle_debug(self):
        """Toggle debug information display."""
        self.show_debug = not self.show_debug
        print(f"Debug UI: {'ON' if self.show_debug else 'OFF'}")
    
    def draw_status_message(self, screen, message, color=(255, 255, 255), duration=None):
        """
        Draw a temporary status message.
        
        Args:
            screen (pygame.Surface): The pygame screen surface
            message (str): Message to display
            color (tuple): RGB color tuple
            duration (float): Optional duration in seconds (not implemented yet)
        """
        if not self.font_medium:
            self.init_fonts()
        
        text = self.font_medium.render(message, True, color)
        text_rect = text.get_rect()
        text_rect.centerx = screen.get_width() // 2
        text_rect.y = screen.get_height() - 50
        
        # Draw background for better readability
        bg_rect = text_rect.inflate(20, 10)
        pygame.draw.rect(screen, (0, 0, 0, 128), bg_rect)
        
        screen.blit(text, text_rect)
    
    def draw_help_overlay(self, screen):
        """
        Draw help overlay with keyboard shortcuts.
        
        Args:
            screen (pygame.Surface): The pygame screen surface
        """
        if not self.font_medium:
            self.init_fonts()
        
        help_lines = [
            "Display Engine Controls:",
            "",
            "ESC/Q - Quit application",
            "F11 - Toggle fullscreen",
            "R - Reload configuration",
            "C - Clear all fog",
            "H - Toggle this help",
            "D - Toggle debug info",
            "",
            "Mouse: Click/drag to clear fog"
        ]
        
        # Calculate overlay size
        line_height = 25
        overlay_height = len(help_lines) * line_height + 40
        overlay_width = 300
        
        # Center the overlay
        overlay_x = (screen.get_width() - overlay_width) // 2
        overlay_y = (screen.get_height() - overlay_height) // 2
        
        # Draw semi-transparent background
        overlay_surface = pygame.Surface((overlay_width, overlay_height), pygame.SRCALPHA)
        overlay_surface.fill((0, 0, 0, 180))
        screen.blit(overlay_surface, (overlay_x, overlay_y))
        
        # Draw border
        pygame.draw.rect(screen, (255, 255, 255), 
                        (overlay_x, overlay_y, overlay_width, overlay_height), 2)
        
        # Draw text lines
        for i, line in enumerate(help_lines):
            if line:  # Skip empty lines
                color = (255, 255, 100) if i == 0 else (255, 255, 255)
                text = self.font_medium.render(line, True, color)
                screen.blit(text, (overlay_x + 20, overlay_y + 20 + i * line_height))