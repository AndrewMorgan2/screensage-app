#!/usr/bin/env python3
"""
Video Players Module for Display Engine

This module handles video playback for both background videos and video elements.
Supports MP4, AVI, MOV, MKV, and WebM formats with threading for smooth playback.

Classes:
    VideoPlayer: Background video player for full-screen videos
    VideoElementPlayer: Element video player for positioned videos with custom sizing
"""

import cv2
import numpy as np
import pygame
import time
from threading import Thread, Lock, Event
import threading
from queue import Queue
try:
    import av
    PYAV_AVAILABLE = True
except ImportError:
    PYAV_AVAILABLE = False
    print("Warning: PyAV not available. WebM transparency may not work correctly.")


class VideoPlayer:
    """
    Background video player for full-screen video backgrounds.
    
    Handles video playback in a separate thread with automatic looping.
    Used for the main background video that fills the entire screen.
    Supports MP4, AVI, MOV, MKV, and WebM formats.
    """
    
    def __init__(self, video_path):
        """
        Initialize the video player.
        
        Args:
            video_path (str): Path to the video file (supports .mp4, .avi, .mov, .mkv, .webm)
        """
        self.video_path = video_path
        self.cap = cv2.VideoCapture(video_path)
        
        # Verify video opened successfully
        if not self.cap.isOpened():
            print(f"Error: Could not open video file: {video_path}")
            raise ValueError(f"Failed to open video file: {video_path}")
        
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30
        self.frame_duration = 1.0 / self.fps
        self.current_frame = None
        self.playing = False
        self.stop_event = Event()  # For immediate thread signaling
        self.frame_lock = Lock()
        self.last_frame_time = 0

        # Get video properties for debugging
        total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        print(f"Loaded background video: {video_path}")
        print(f"  Format: {video_path.split('.')[-1].upper()}")
        print(f"  Resolution: {width}x{height}")
        print(f"  FPS: {self.fps:.2f}")
        print(f"  Duration: {total_frames/self.fps:.1f}s ({total_frames} frames)")
        self.frame_queue = Queue(maxsize=5)
        self.prefetch_thread = None
        self.should_prefetch = True
        
    def start_prefetch(self):
        """Start prefetching frames in background"""
        self.should_prefetch = True
        self.prefetch_thread = threading.Thread(target=self._prefetch_frames, daemon=True)
        self.prefetch_thread.start()
    
    def _prefetch_frames(self):
        """Background thread to prefetch frames"""
        while self.should_prefetch and self.playing:
            if not self.frame_queue.full():
                ret, frame = self.cap.read()
                if ret:
                    # Process frame
                    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    if self.target_width and self.target_height:
                        frame = cv2.resize(frame, (self.target_width, self.target_height))
                    self.frame_queue.put(frame)
            else:
                time.sleep(0.01)
    
    def get_current_frame(self):
        """Get frame from queue instead of direct read"""
        if not self.frame_queue.empty():
            frame = self.frame_queue.get()
            # Convert to pygame surface
            frame = np.rot90(frame)
            frame = np.flipud(frame)
            return pygame.surfarray.make_surface(frame)
        return None
        
    def start(self):
        """Start video playback in a separate thread."""
        self.playing = True
        self.thread = Thread(target=self._play_loop, daemon=True)
        self.thread.start()
        print(f"✓ Background video playback started")
    
    def stop(self):
        """Stop video playback and cleanup resources."""
        # Signal thread to stop immediately
        self.playing = False
        self.stop_event.set()

        # Close resources immediately
        try:
            self.cap.release()
        except Exception:
            pass
        print(f"✓ Background video playback stopped")
    
    def _play_loop(self):
        """
        Internal method for video playback loop.
        Runs in a separate thread to maintain consistent framerate.
        """
        while self.playing and not self.stop_event.is_set():
            current_time = time.time()
            if current_time - self.last_frame_time >= self.frame_duration:
                try:
                    ret, frame = self.cap.read()
                    if not ret:
                        if self.stop_event.is_set():
                            return
                        # Loop video by resetting to beginning
                        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = self.cap.read()
                        if ret:
                            print("🔄 Background video looped")

                    if ret:
                        # Convert BGR to RGB for pygame compatibility
                        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        with self.frame_lock:
                            self.current_frame = frame
                        self.last_frame_time = current_time
                    else:
                        if self.playing:
                            print("Warning: Failed to read video frame")

                except (cv2.error, ValueError, OSError, AttributeError) as e:
                    # Capture was released or errored - exit gracefully
                    if self.stop_event.is_set():
                        return
                    print(f"Background video playback ended: {e}")
                    break
                except Exception as e:
                    if self.stop_event.is_set():
                        return
                    print(f"Error reading background video frame: {e}")
                    break

            time.sleep(0.001)  # Small sleep to prevent excessive CPU usage
    
    def get_frame(self):
        """
        Get the current video frame as a numpy array.
        
        Returns:
            numpy.ndarray or None: Current frame in RGB format, or None if no frame available
        """
        with self.frame_lock:
            return self.current_frame.copy() if self.current_frame is not None else None


class VideoElementPlayer:
    """
    Video element player for positioned videos with custom dimensions.
    
    Handles video playback for video elements that can be placed anywhere on screen
    with custom width/height. Supports aspect ratio preservation and automatic looping.
    Supports MP4, AVI, MOV, MKV, and WebM formats.
    """
    
    def __init__(self, video_path, width=None, height=None):
        """
        Initialize the video element player.

        Args:
            video_path (str): Path to the video file (supports .mp4, .avi, .mov, .mkv, .webm)
            width (int, optional): Target width. If None, uses original width
            height (int, optional): Target height. If None, uses original height

        Note:
            If only width OR height is specified, aspect ratio is preserved.
            If both are specified, video is stretched to exact dimensions.
        """
        self.video_path = video_path
        self.width = width
        self.height = height

        # Check if this is a WebM file that might have transparency
        self.is_webm = video_path.lower().endswith('.webm')
        self.use_pyav = self.is_webm and PYAV_AVAILABLE

        if self.use_pyav:
            # Use PyAV for WebM files to properly handle transparency
            try:
                self.container = av.open(video_path)
                self.video_stream = self.container.streams.video[0]

                # Get video properties
                self.original_width = self.video_stream.width
                self.original_height = self.video_stream.height
                self.fps = float(self.video_stream.average_rate) or 30

                # Check for alpha mode in metadata
                stream_tags = self.video_stream.metadata
                has_alpha_tag = stream_tags.get('alpha_mode') == '1' if stream_tags else False

                # Check codec for alpha support
                codec_name = self.video_stream.codec_context.name
                codec_supports_alpha = codec_name in ['vp8', 'vp9', 'libvpx', 'libvpx-vp9']

                self.has_alpha = has_alpha_tag and codec_supports_alpha

                print(f"Using PyAV for WebM: {video_path}")
                print(f"  Codec: {codec_name}")
                print(f"  Dimensions: {self.original_width}x{self.original_height}")
                print(f"  FPS: {self.fps:.2f}")
                print(f"  Alpha mode tag: {has_alpha_tag}")
                print(f"  Alpha support: {self.has_alpha}")

            except Exception as e:
                print(f"Failed to open with PyAV, falling back to OpenCV: {e}")
                import traceback
                traceback.print_exc()
                self.use_pyav = False
                self.container = None
                self.cap = cv2.VideoCapture(video_path)
                if not self.cap.isOpened():
                    raise ValueError(f"Failed to open video file: {video_path}")
                self.original_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                self.original_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                self.has_alpha = False
                self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30
        else:
            # Use OpenCV for other video formats
            self.container = None
            self.cap = cv2.VideoCapture(video_path)

            # Verify video opened successfully
            if not self.cap.isOpened():
                print(f"Error: Could not open video element: {video_path}")
                raise ValueError(f"Failed to open video file: {video_path}")

            self.original_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            self.original_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            self.has_alpha = False
            self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30

        self.frame_duration = 1.0 / self.fps
        self.current_frame = None
        self.playing = False
        self.stop_event = Event()  # For immediate thread signaling
        self.frame_lock = Lock()
        self.last_frame_time = 0

        # Calculate target dimensions with aspect ratio preservation
        # (original_width and original_height already set above)
        if not self.width and not self.height:
            # Use original size if no dimensions specified
            self.target_width = self.original_width
            self.target_height = self.original_height
        else:
            # Use specified dimensions, maintaining aspect ratio if only one is given
            if self.width and not self.height:
                self.target_width = self.width
                self.target_height = int(self.width * self.original_height / self.original_width)
            elif self.height and not self.width:
                self.target_height = self.height
                self.target_width = int(self.height * self.original_width / self.original_height)
            else:
                self.target_width = self.width
                self.target_height = self.height

        # Get additional video properties for debugging
        video_format = video_path.split('.')[-1].upper()

        if self.use_pyav:
            # PyAV doesn't have easy frame count access
            print(f"Loaded video element: {video_path}")
            print(f"  Format: {video_format}")
            print(f"  Original: {self.original_width}x{self.original_height}")
            print(f"  Target: {self.target_width}x{self.target_height}")
            print(f"  FPS: {self.fps:.2f}")
        else:
            total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
            print(f"Loaded video element: {video_path}")
            print(f"  Format: {video_format}")
            print(f"  Original: {self.original_width}x{self.original_height}")
            print(f"  Target: {self.target_width}x{self.target_height}")
            print(f"  FPS: {self.fps:.2f}")
            print(f"  Duration: {total_frames/self.fps:.1f}s ({total_frames} frames)")
        
    def start(self):
        """Start video playback in a separate thread."""
        self.playing = True
        self.thread = Thread(target=self._play_loop, daemon=True)
        self.thread.start()
        print(f"✓ Video element playback started: {self.video_path}")
    
    def stop(self):
        """Stop video playback and cleanup resources."""
        # Signal thread to stop immediately
        self.playing = False
        if hasattr(self, 'stop_event'):
            self.stop_event.set()

        # Close resources immediately - exceptions will trigger thread exit
        try:
            if hasattr(self, 'container') and self.container is not None:
                self.container.close()
                self.container = None
        except Exception:
            pass

        try:
            if hasattr(self, 'cap') and self.cap is not None:
                self.cap.release()
                self.cap = None
        except Exception:
            pass
    
    def _play_loop(self):
        """
        Internal method for video playback loop.
        Runs in a separate thread with frame resizing.
        """
        if self.use_pyav:
            # PyAV-based playback loop for WebM with alpha
            self._play_loop_pyav()
        else:
            # OpenCV-based playback loop
            self._play_loop_opencv()

    def _play_loop_pyav(self):
        """PyAV-based playback loop for WebM files with alpha channel support."""
        while self.playing and not self.stop_event.is_set():
            current_time = time.time()
            if current_time - self.last_frame_time >= self.frame_duration:
                frame = None

                try:
                    # Decode next frame (check stop_event for immediate exit)
                    for packet in self.container.demux(self.video_stream):
                        if self.stop_event.is_set():  # Check before processing packet
                            return

                        for av_frame in packet.decode():
                            if self.stop_event.is_set():  # Check before processing frame
                                return

                            # Convert to numpy array with RGBA format
                            img = av_frame.to_ndarray(format='rgba')

                            # WebM files with alpha_mode=1 use dark pixels for transparency
                            # Use threshold to catch nearly-black pixels from compression artifacts
                            if self.has_alpha:
                                # Make a copy to avoid modifying PyAV's internal data
                                img = img.copy()
                                # Find dark pixels (where R,G,B are all <= 30 to handle compression artifacts)
                                is_dark = np.all(img[:,:,:3] <= 30, axis=2)
                                # Set alpha to 0 for dark pixels
                                img[is_dark, 3] = 0

                            # Resize if needed
                            if (img.shape[1] != self.target_width or img.shape[0] != self.target_height):
                                from PIL import Image
                                pil_img = Image.fromarray(img, 'RGBA')
                                pil_img = pil_img.resize((self.target_width, self.target_height), Image.Resampling.LANCZOS)
                                frame = np.array(pil_img)
                            else:
                                frame = img

                            break
                        if frame is not None:
                            break

                    # If we didn't get a frame, we've reached the end - loop
                    if frame is None and self.playing and not self.stop_event.is_set():
                        # Seek back to beginning
                        self.container.seek(0)
                        print(f"🔄 Video element looped: {self.video_path}")

                        # Get first frame
                        for packet in self.container.demux(self.video_stream):
                            if self.stop_event.is_set():  # Check before processing packet
                                return

                            for av_frame in packet.decode():
                                if self.stop_event.is_set():  # Check before processing frame
                                    return

                                img = av_frame.to_ndarray(format='rgba')

                                # Apply dark-to-transparent conversion
                                if self.has_alpha:
                                    # Make a copy to avoid modifying PyAV's internal data
                                    img = img.copy()
                                    is_dark = np.all(img[:,:,:3] <= 30, axis=2)
                                    img[is_dark, 3] = 0

                                if (img.shape[1] != self.target_width or img.shape[0] != self.target_height):
                                    from PIL import Image
                                    pil_img = Image.fromarray(img, 'RGBA')
                                    pil_img = pil_img.resize((self.target_width, self.target_height), Image.Resampling.LANCZOS)
                                    frame = np.array(pil_img)
                                else:
                                    frame = img
                                break
                            break

                except (EOFError, StopIteration, ValueError, OSError, AttributeError) as e:
                    # Container was closed or reached EOF - exit gracefully
                    # AttributeError can happen when container is closed mid-demux
                    if self.stop_event.is_set():
                        return
                    print(f"Video playback ended: {e}")
                    break
                except Exception as e:
                    # Catch other errors but exit if we're stopping
                    if self.stop_event.is_set():
                        return
                    print(f"Error decoding frame with PyAV: {e}")
                    import traceback
                    traceback.print_exc()
                    break

                if frame is not None:
                    with self.frame_lock:
                        self.current_frame = frame
                    self.last_frame_time = current_time
                else:
                    if self.playing:  # Only warn if we're still supposed to be playing
                        print(f"Warning: Failed to read frame from video element: {self.video_path}")

            time.sleep(0.001)

    def _play_loop_opencv(self):
        """OpenCV-based playback loop for standard video formats."""
        while self.playing and not self.stop_event.is_set():
            current_time = time.time()
            if current_time - self.last_frame_time >= self.frame_duration:
                frame = None

                try:
                    # Read frame using OpenCV
                    ret, frame = self.cap.read()
                    if not ret:
                        if self.stop_event.is_set():  # Exit if we're stopping
                            return
                        # Loop video by resetting to beginning
                        self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = self.cap.read()
                        if ret:
                            print(f"🔄 Video element looped: {self.video_path}")

                    if ret and frame is not None:
                        # Resize frame if needed
                        if (frame.shape[1] != self.target_width or frame.shape[0] != self.target_height):
                            frame = cv2.resize(frame, (self.target_width, self.target_height))

                        # Convert BGR to RGB (OpenCV format to pygame format)
                        frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                    if frame is not None:
                        with self.frame_lock:
                            self.current_frame = frame
                        self.last_frame_time = current_time
                    else:
                        if self.playing:  # Only warn if we're still supposed to be playing
                            print(f"Warning: Failed to read frame from video element: {self.video_path}")

                except (cv2.error, ValueError, OSError, AttributeError) as e:
                    # Capture was released or errored - exit gracefully
                    # AttributeError can happen when cap is released mid-read
                    if self.stop_event.is_set():
                        return
                    print(f"OpenCV video playback ended: {e}")
                    break
                except Exception as e:
                    # Catch other errors but exit if we're stopping
                    if self.stop_event.is_set():
                        return
                    print(f"Error reading frame with OpenCV: {e}")
                    import traceback
                    traceback.print_exc()
                    break

            time.sleep(0.001)  # Small sleep to prevent excessive CPU usage
    
    def get_current_frame_surface(self):
        """
        Get current frame as a pygame surface ready for blitting.
        Handles both standard and transparent videos.

        Returns:
            pygame.Surface or None: Current frame as pygame surface, or None if no frame available
        """
        with self.frame_lock:
            if self.current_frame is not None:
                frame = self.current_frame

                # Check if frame has alpha channel
                if len(frame.shape) == 3 and frame.shape[2] == 4:
                    # Has alpha channel - use pygame.image.frombuffer for proper RGBA handling
                    # Frame is in RGBA format from imageio
                    surface = pygame.image.frombuffer(
                        frame.tobytes(),
                        (frame.shape[1], frame.shape[0]),
                        'RGBA'
                    )
                else:
                    # No alpha channel - standard RGB
                    # Convert numpy array to pygame surface
                    frame_rotated = np.rot90(frame)
                    frame_flipped = np.flipud(frame_rotated)
                    surface = pygame.surfarray.make_surface(frame_flipped)

                return surface
            return None
    
    def get_video_info(self):
        """
        Get detailed information about the video.
        
        Returns:
            dict: Video information including format, dimensions, fps, etc.
        """
        total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        current_frame = int(self.cap.get(cv2.CAP_PROP_POS_FRAMES))
        
        return {
            'path': self.video_path,
            'format': self.video_path.split('.')[-1].upper(),
            'original_size': (self.original_width, self.original_height),
            'target_size': (self.target_width, self.target_height),
            'fps': self.fps,
            'total_frames': total_frames,
            'current_frame': current_frame,
            'duration_seconds': total_frames / self.fps if self.fps > 0 else 0,
            'progress_percent': (current_frame / total_frames * 100) if total_frames > 0 else 0,
            'playing': self.playing
        }


def get_supported_video_formats():
    """
    Get list of supported video formats.
    
    Returns:
        list: List of supported video file extensions
    """
    return ['.mp4', '.avi', '.mov', '.mkv', '.webm']


def is_supported_video_format(file_path):
    """
    Check if a file has a supported video format.
    
    Args:
        file_path (str): Path to the video file
        
    Returns:
        bool: True if format is supported, False otherwise
    """
    if not file_path:
        return False
    
    file_extension = '.' + file_path.split('.')[-1].lower()
    return file_extension in get_supported_video_formats()


def validate_video_file(file_path):
    """
    Validate that a video file exists and can be opened by OpenCV.
    
    Args:
        file_path (str): Path to the video file
        
    Returns:
        dict: Validation result with 'valid' boolean and 'error' message if invalid
    """
    import os
    
    # Check if file exists
    if not os.path.exists(file_path):
        return {
            'valid': False,
            'error': f"Video file not found: {file_path}"
        }
    
    # Check if format is supported
    if not is_supported_video_format(file_path):
        supported = ', '.join(get_supported_video_formats())
        return {
            'valid': False,
            'error': f"Unsupported video format. Supported formats: {supported}"
        }
    
    # Try to open with OpenCV
    try:
        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            cap.release()
            return {
                'valid': False,
                'error': f"OpenCV could not open video file: {file_path}"
            }
        
        # Try to read one frame to ensure video is readable
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            return {
                'valid': False,
                'error': f"Video file appears corrupt or unreadable: {file_path}"
            }
        
        return {
            'valid': True,
            'error': None
        }
        
    except Exception as e:
        return {
            'valid': False,
            'error': f"Error validating video file: {str(e)}"
        }