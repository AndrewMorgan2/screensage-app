#!/usr/bin/env python3
"""
GIF Player Module for Display Engine

This module handles animated GIF playback for positioned elements.
Supports frame timing, resizing, and automatic looping.

Classes:
    GifPlayer: Animated GIF player with custom dimensions and positioning
"""

import pygame
import time
from threading import Lock
from PIL import Image, ImageSequence


class GifPlayer:
    """
    Animated GIF player for positioned elements.
    
    Loads and plays animated GIFs with proper frame timing and optional resizing.
    Handles frame duration from GIF metadata and provides smooth animation playback.
    """
    
    def __init__(self, gif_path, width=None, height=None):
        """
        Initialize the GIF player.
        
        Args:
            gif_path (str): Path to the GIF file
            width (int, optional): Target width for resizing. If None, uses original width
            height (int, optional): Target height for resizing. If None, uses original height
            
        Note:
            If width and height are both specified, GIF is resized to exact dimensions.
            If neither is specified, original GIF dimensions are used.
        """
        self.gif_path = gif_path
        self.width = width
        self.height = height
        self.frames = []
        self.frame_durations = []
        self.current_frame_index = 0
        self.last_frame_time = 0
        self.playing = True
        self.frame_lock = Lock()
        self.load_gif()
        
    def load_gif(self):
        """
        Load GIF frames and timing information using PIL.
        
        Converts each frame to pygame surface format and extracts frame duration
        from GIF metadata. Handles frame resizing if dimensions are specified.
        """
        try:
            with Image.open(self.gif_path) as gif:
                for frame in ImageSequence.Iterator(gif):
                    # Convert to RGBA for proper transparency support
                    frame = frame.convert('RGBA')
                    
                    # Resize if dimensions specified
                    if self.width and self.height:
                        frame = frame.resize((self.width, self.height), Image.Resampling.LANCZOS)
                    
                    # Convert PIL image to pygame surface
                    frame_data = frame.tobytes()
                    frame_surface = pygame.image.fromstring(frame_data, frame.size, 'RGBA')
                    self.frames.append(frame_surface)
                    
                    # Get frame duration from GIF metadata (in milliseconds)
                    duration = frame.info.get('duration', 100)  # Default 100ms if not specified
                    self.frame_durations.append(duration / 1000.0)  # Convert to seconds
                    
        except Exception as e:
            print(f"Error loading GIF {self.gif_path}: {e}")
            # Create a placeholder frame if loading fails
            placeholder = pygame.Surface((self.width or 100, self.height or 100), pygame.SRCALPHA)
            placeholder.fill((255, 0, 255, 128))  # Magenta placeholder with transparency
            self.frames = [placeholder]
            self.frame_durations = [0.1]  # 100ms default duration
    
    def get_current_frame(self):
        """
        Get the current frame and advance animation based on timing.
        
        Uses frame duration from GIF metadata to determine when to advance to the next frame.
        Handles automatic looping when reaching the end of the animation.
        
        Returns:
            pygame.Surface: Current frame as pygame surface ready for blitting
        """
        if not self.frames:
            return None
            
        current_time = time.time()
        frame_duration = self.frame_durations[self.current_frame_index]
        
        # Check if it's time to advance to the next frame
        if current_time - self.last_frame_time >= frame_duration:
            self.current_frame_index = (self.current_frame_index + 1) % len(self.frames)
            self.last_frame_time = current_time
        
        # Return current frame in thread-safe manner
        with self.frame_lock:
            return self.frames[self.current_frame_index]
    
    def stop(self):
        """
        Stop the GIF player and mark it for cleanup.
        
        Sets playing flag to False to indicate the player should be cleaned up.
        Frame data remains available until the object is destroyed.
        """
        self.playing = False
    
    def get_dimensions(self):
        """
        Get the dimensions of the loaded GIF frames.
        
        Returns:
            tuple: (width, height) of the GIF frames, or (0, 0) if no frames loaded
        """
        if self.frames:
            return self.frames[0].get_size()
        return (0, 0)
    
    def get_frame_count(self):
        """
        Get the number of frames in the GIF.
        
        Returns:
            int: Number of frames in the animation
        """
        return len(self.frames)
    
    def reset_animation(self):
        """
        Reset animation to the first frame.
        
        Useful for restarting animations or synchronizing multiple GIFs.
        """
        self.current_frame_index = 0
        self.last_frame_time = time.time()