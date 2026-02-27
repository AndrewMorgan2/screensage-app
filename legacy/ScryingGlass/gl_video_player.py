#!/usr/bin/env python3
"""
OpenGL-Accelerated Video Player for Display Engine

This module provides hardware-accelerated video playback with full alpha channel
support using ModernGL. Designed to work alongside pygame for hybrid rendering.

Classes:
    GLVideoPlayer: GPU-accelerated video player with transparency support
"""

import numpy as np
import time
from threading import Thread, Lock, Event
import moderngl
import pygame

try:
    import av
    PYAV_AVAILABLE = True
except ImportError:
    PYAV_AVAILABLE = False
    print("Warning: PyAV not available. GL video player requires PyAV.")


class GLVideoPlayer:
    """
    Hardware-accelerated video player with alpha channel support.

    Uses ModernGL for GPU rendering and PyAV for video decoding.
    Designed to integrate with pygame-based display engines for hybrid rendering.
    """

    def __init__(self, gl_context, video_path, width=None, height=None):
        """
        Initialize the GL video player.

        Args:
            gl_context (moderngl.Context): ModernGL context
            video_path (str): Path to the video file (WebM with alpha recommended)
            width (int, optional): Target width. If None, uses original width
            height (int, optional): Target height. If None, uses original height
        """
        if not PYAV_AVAILABLE:
            raise RuntimeError("PyAV is required for GLVideoPlayer. Install with: pip install av")

        self.ctx = gl_context
        self.video_path = video_path
        self.width = width
        self.height = height

        # Open video file with PyAV
        try:
            self.container = av.open(video_path)
            self.video_stream = self.container.streams.video[0]
        except Exception as e:
            raise ValueError(f"Failed to open video file: {video_path}. Error: {e}")

        # Get video properties
        self.original_width = self.video_stream.width
        self.original_height = self.video_stream.height
        self.fps = float(self.video_stream.average_rate) or 30

        # Check for alpha support
        stream_tags = self.video_stream.metadata
        has_alpha_tag = stream_tags.get('alpha_mode') == '1' if stream_tags else False
        codec_name = self.video_stream.codec_context.name
        codec_supports_alpha = codec_name in ['vp8', 'vp9', 'libvpx', 'libvpx-vp9']
        self.has_alpha = has_alpha_tag and codec_supports_alpha

        # Calculate target dimensions
        if not self.width and not self.height:
            self.target_width = self.original_width
            self.target_height = self.original_height
        elif self.width and not self.height:
            self.target_width = self.width
            self.target_height = int(self.width * self.original_height / self.original_width)
        elif self.height and not self.width:
            self.target_height = self.height
            self.target_width = int(self.height * self.original_width / self.original_height)
        else:
            self.target_width = self.width
            self.target_height = self.height

        # Create OpenGL texture for video frames
        self.texture = self.ctx.texture(
            (self.target_width, self.target_height),
            4,  # RGBA
            dtype='f1'  # unsigned byte
        )
        self.texture.filter = (moderngl.LINEAR, moderngl.LINEAR)
        self.texture.swizzle = 'RGBA'  # Ensure proper color channel ordering

        # Playback state
        self.current_frame = None
        self.frame_lock = Lock()
        self.playing = False
        self.stop_event = Event()
        self.frame_duration = 1.0 / self.fps
        self.last_frame_time = 0
        self.thread = None

        print(f"✓ Created GL video player: {video_path}")
        print(f"  Codec: {codec_name}")
        print(f"  Original: {self.original_width}x{self.original_height}")
        print(f"  Target: {self.target_width}x{self.target_height}")
        print(f"  FPS: {self.fps:.2f}")
        print(f"  Alpha support: {self.has_alpha}")

    def start(self):
        """Start video playback in a separate thread."""
        if self.playing:
            return

        self.playing = True
        self.stop_event.clear()
        self.thread = Thread(target=self._play_loop, daemon=True)
        self.thread.start()
        print(f"✓ GL video playback started: {self.video_path}")

    def stop(self):
        """Stop video playback and cleanup resources."""
        self.playing = False
        self.stop_event.set()

        # Close video container
        try:
            if hasattr(self, 'container') and self.container is not None:
                self.container.close()
                self.container = None
        except Exception:
            pass

        print(f"✓ GL video playback stopped: {self.video_path}")

    def _play_loop(self):
        """
        Internal playback loop running in separate thread.
        Decodes video frames and uploads to GPU texture.
        """
        while self.playing and not self.stop_event.is_set():
            current_time = time.time()

            if current_time - self.last_frame_time >= self.frame_duration:
                try:
                    frame_decoded = False

                    # Decode next frame
                    for packet in self.container.demux(self.video_stream):
                        if self.stop_event.is_set():
                            return

                        for av_frame in packet.decode():
                            if self.stop_event.is_set():
                                return

                            # Convert to RGBA numpy array
                            img = av_frame.to_ndarray(format='rgba')

                            # Apply dark-to-transparent conversion for WebM alpha
                            if self.has_alpha:
                                img = img.copy()
                                is_dark = np.all(img[:,:,:3] <= 30, axis=2)
                                img[is_dark, 3] = 0

                            # Resize if needed
                            if (img.shape[1] != self.target_width or
                                img.shape[0] != self.target_height):
                                from PIL import Image
                                pil_img = Image.fromarray(img, 'RGBA')
                                pil_img = pil_img.resize(
                                    (self.target_width, self.target_height),
                                    Image.Resampling.LANCZOS
                                )
                                img = np.array(pil_img)

                            # Upload to GPU texture
                            with self.frame_lock:
                                # Flip vertically for OpenGL coordinates
                                img_flipped = np.flipud(img)
                                self.texture.write(img_flipped.tobytes())
                                self.current_frame = img  # Keep CPU copy for debugging

                            self.last_frame_time = current_time
                            frame_decoded = True
                            break

                        if frame_decoded:
                            break

                    # If we didn't decode a frame, we've reached the end - loop
                    if not frame_decoded and self.playing and not self.stop_event.is_set():
                        self.container.seek(0)
                        print(f"🔄 GL video looped: {self.video_path}")

                except (EOFError, StopIteration, ValueError, OSError, AttributeError) as e:
                    if self.stop_event.is_set():
                        return
                    print(f"GL video playback ended: {e}")
                    break
                except Exception as e:
                    if self.stop_event.is_set():
                        return
                    print(f"Error in GL video playback: {e}")
                    import traceback
                    traceback.print_exc()
                    break

            time.sleep(0.001)  # Small sleep to prevent CPU spinning

    def get_texture(self):
        """
        Get the OpenGL texture containing the current video frame.

        Returns:
            moderngl.Texture: The texture with the current frame
        """
        return self.texture

    def cleanup(self):
        """Clean up resources."""
        self.stop()

        # Release texture
        try:
            if hasattr(self, 'texture') and self.texture is not None:
                self.texture.release()
        except Exception:
            pass


class GLVideoRenderer:
    """
    Helper class to render GL video textures onto pygame/OpenGL display.

    Manages shaders and rendering pipeline for video playback.
    """

    def __init__(self, gl_context, screen_width, screen_height):
        """
        Initialize the GL video renderer.

        Args:
            gl_context (moderngl.Context): ModernGL context
            screen_width (int): Screen width in pixels
            screen_height (int): Screen height in pixels
        """
        self.ctx = gl_context
        self.screen_width = screen_width
        self.screen_height = screen_height

        # Create shader program for rendering textured quads
        self.program = self.ctx.program(
            vertex_shader='''
                #version 330

                in vec2 in_position;
                in vec2 in_texcoord;

                out vec2 v_texcoord;

                void main() {
                    v_texcoord = in_texcoord;
                    gl_Position = vec4(in_position, 0.0, 1.0);
                }
            ''',
            fragment_shader='''
                #version 330

                uniform sampler2D video_texture;

                in vec2 v_texcoord;
                out vec4 fragColor;

                void main() {
                    fragColor = texture(video_texture, v_texcoord);
                }
            '''
        )

        # We'll create vertex buffers on-demand for each video position/size
        self.vao_cache = {}  # Cache VAOs for different geometries

    def _screen_to_ndc(self, x, y, width, height):
        """
        Convert screen coordinates to normalized device coordinates (NDC).

        Args:
            x, y (int): Top-left position in screen coordinates
            width, height (int): Dimensions in pixels

        Returns:
            tuple: (x1, y1, x2, y2) in NDC space [-1, 1]
        """
        # Convert to NDC (OpenGL uses -1 to 1, with Y inverted from pygame)
        x1 = (x / self.screen_width) * 2.0 - 1.0
        x2 = ((x + width) / self.screen_width) * 2.0 - 1.0

        # Invert Y (pygame has origin top-left, OpenGL has origin bottom-left)
        y1 = 1.0 - (y / self.screen_height) * 2.0
        y2 = 1.0 - ((y + height) / self.screen_height) * 2.0

        return x1, y1, x2, y2

    def _get_vao_for_rect(self, x, y, width, height):
        """
        Get or create a VAO for rendering a video at the specified position.

        Args:
            x, y (int): Top-left position in screen coordinates
            width, height (int): Dimensions in pixels

        Returns:
            moderngl.VertexArray: VAO for this rectangle
        """
        cache_key = (x, y, width, height)

        if cache_key in self.vao_cache:
            return self.vao_cache[cache_key]

        # Convert to NDC
        x1, y1, x2, y2 = self._screen_to_ndc(x, y, width, height)

        # Create vertex data (position + texcoord)
        vertices = np.array([
            # Position (x, y)    # TexCoord (u, v)
            x1, y2,              0.0, 0.0,  # Bottom-left
            x2, y2,              1.0, 0.0,  # Bottom-right
            x1, y1,              0.0, 1.0,  # Top-left
            x2, y1,              1.0, 1.0,  # Top-right
        ], dtype='f4')

        # Create vertex buffer
        vbo = self.ctx.buffer(vertices.tobytes())

        # Create vertex array object
        vao = self.ctx.vertex_array(
            self.program,
            [
                (vbo, '2f 2f', 'in_position', 'in_texcoord')
            ]
        )

        # Cache for reuse
        self.vao_cache[cache_key] = vao

        return vao

    def render_video(self, video_player, x, y, width=None, height=None):
        """
        Render a video player's current frame at the specified position.

        Args:
            video_player (GLVideoPlayer): The video player to render
            x, y (int): Top-left position in screen coordinates
            width, height (int, optional): Override dimensions (defaults to video size)
        """
        if width is None:
            width = video_player.target_width
        if height is None:
            height = video_player.target_height

        # Get VAO for this position/size
        vao = self._get_vao_for_rect(x, y, width, height)

        # Bind video texture
        video_player.get_texture().use(0)
        self.program['video_texture'] = 0

        # Render
        vao.render(mode=moderngl.TRIANGLE_STRIP)

    def render_video_to_pygame_surface(self, video_player, width=None, height=None):
        """
        Render a video frame to a pygame surface.
        This is a hybrid approach that reads back GL texture to CPU for pygame blitting.

        Args:
            video_player (GLVideoPlayer): The video player to render
            width, height (int, optional): Override dimensions (defaults to video size)

        Returns:
            pygame.Surface: Surface with the video frame (with alpha channel)
        """
        if width is None:
            width = video_player.target_width
        if height is None:
            height = video_player.target_height

        # Get the texture from the video player
        texture = video_player.get_texture()

        # Read texture data to numpy array
        data = texture.read()
        img = np.frombuffer(data, dtype=np.uint8).reshape((height, width, 4))

        # Flip vertically (OpenGL to pygame coordinates)
        img = np.flipud(img)

        # Create pygame surface from the image data
        # Use RGBA format with per-pixel alpha
        surface = pygame.image.frombuffer(
            img.tobytes(),
            (width, height),
            'RGBA'
        )

        return surface

    def clear_cache(self):
        """Clear the VAO cache (call when screen size changes)."""
        for vao in self.vao_cache.values():
            vao.release()
        self.vao_cache.clear()

    def cleanup(self):
        """Clean up resources."""
        self.clear_cache()
        if hasattr(self, 'program'):
            self.program.release()
