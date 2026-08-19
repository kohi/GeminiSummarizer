import os
import struct
import zlib

def create_png(width, height, draw_func):
    """Generate a valid RGBA PNG without external dependencies."""
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # Filter type None
        for x in range(width):
            r, g, b, a = draw_func(x, y, width, height)
            raw_data.extend([r, g, b, a])
    
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)
    
    png = bytearray(b'\x89PNG\r\n\x1a\n')
    # IHDR
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png.extend(chunk(b'IHDR', ihdr))
    # IDAT
    compressed = zlib.compress(bytes(raw_data), 9)
    png.extend(chunk(b'IDAT', compressed))
    # IEND
    png.extend(chunk(b'IEND', b''))
    return bytes(png)

def icon_drawer(x, y, w, h):
    # Normalized coordinates
    nx = x / (w - 1) if w > 1 else 0.5
    ny = y / (h - 1) if h > 1 else 0.5
    
    # Rounded corner background
    radius = 0.22
    dx = max(radius - nx, 0, nx - (1 - radius))
    dy = max(radius - ny, 0, ny - (1 - radius))
    dist = (dx*dx + dy*dy) ** 0.5
    
    if dist > radius:
        return 0, 0, 0, 0  # Transparent outside rounded rect
    
    # Smooth antialiasing edge
    alpha = 255
    if dist > radius - 0.04:
        alpha = int(255 * (radius - dist) / 0.04)
        alpha = max(0, min(255, alpha))

    # Background gradient: Google Gemini / YouTube fusion style
    bg_r = int(26 + (142 - 26) * nx)
    bg_g = int(115 + (36 - 115) * ny)
    bg_b = int(232 + (170 - 232) * ((nx + ny) / 2))
    
    # Draw Sparkle / Star in center
    cx, cy = 0.5, 0.5
    rx = abs(nx - cx)
    ry = abs(ny - cy)
    
    star_size = 0.36
    star_dist = (rx ** 0.6) + (ry ** 0.6)
    if star_dist < star_size:
        star_intensity = 1.0 - (star_dist / star_size)
        r = int(bg_r * (1 - star_intensity) + 255 * star_intensity)
        g = int(bg_g * (1 - star_intensity) + 255 * star_intensity)
        b = int(bg_b * (1 - star_intensity) + 255 * star_intensity)
        return r, g, b, alpha

    return bg_r, bg_g, bg_b, alpha

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), 'icons')
    os.makedirs(icons_dir, exist_ok=True)
    
    for size in [16, 48, 128]:
        png_data = create_png(size, size, icon_drawer)
        file_path = os.path.join(icons_dir, f'icon-{size}.png')
        with open(file_path, 'wb') as f:
            f.write(png_data)
        print(f"Generated: {file_path} ({size}x{size})")

if __name__ == '__main__':
    main()
