import os
from PIL import Image, ImageDraw

def create_shield_icon(size):
    # Create image with RGBA (transparent)
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale coordinates
    s = size / 128.0
    
    # Background circle with subtle glow
    margin = 4 * s
    bg_box = [margin, margin, size - margin, size - margin]
    draw.ellipse(bg_box, fill=(15, 23, 42, 255)) # Dark slate navy #0f172a
    
    # Outer ring
    draw.ellipse(bg_box, outline=(16, 185, 129, 200), width=max(1, int(3 * s))) # Emerald #10b981
    
    # Shield shape points
    # Points scaled relative to 128x128
    shield_points = [
        (64 * s, 26 * s),  # Top center
        (96 * s, 38 * s),  # Top right
        (96 * s, 68 * s),  # Mid right
        (64 * s, 102 * s), # Bottom point
        (32 * s, 68 * s),  # Mid left
        (32 * s, 38 * s),  # Top left
    ]
    
    # Fill shield with vibrant gradient emerald / teal
    draw.polygon(shield_points, fill=(16, 185, 129, 255))
    
    # Inner checkmark or surf wave
    check_points = [
        (48 * s, 62 * s),
        (58 * s, 74 * s),
        (80 * s, 48 * s)
    ]
    draw.line(check_points, fill=(255, 255, 255, 255), width=max(1, int(6 * s)), joint="curve")
    
    return img

def main():
    icons_dir = r"d:\Adult_content_blocker\safesurf\extension\icons"
    os.makedirs(icons_dir, exist_ok=True)
    
    sizes = [16, 32, 48, 128]
    for sz in sizes:
        icon = create_shield_icon(sz)
        output_path = os.path.join(icons_dir, f"icon{sz}.png")
        icon.save(output_path, "PNG")
        print(f"Generated {output_path} ({sz}x{sz})")

if __name__ == "__main__":
    main()
