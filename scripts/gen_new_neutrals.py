import requests, json, time, sys, os, io
from PIL import Image

TOKEN = "r8_FZhZE20dEhcBJS4Pz7pxh1eMFpiF5YD3ThUwb"
IMG_DIR = "public/images/blog"

prompts = {
    "new-neutrals-hero.jpg": "Canon EOS R5 interior photograph at f/1.4, wide shot of a warm cozy bedroom with blush pink and terracotta layered pillows on a cream linen bed, soft golden morning light streaming through window, 35mm film grain, cinematic color grading, earthy palette of blush pink terracotta cream and warm amber",
    "new-neutrals-1.jpg": "Canon EOS R5 interior photograph at f/1.4, close up of blush pink velvet pillows on a cream bedspread, soft morning sunlight, textured fabric visible, cozy bedroom decor, 35mm film grain, warm natural lighting",
    "new-neutrals-2.jpg": "Canon EOS R5 interior photograph at f/1.4, overhead flat lay of a terracotta circle patterned pillow layered in front of blush pink pillows on a white bed, warm golden hour light from side, cozy bedroom styling, 35mm film grain",
    "new-neutrals-3.jpg": "Canon EOS R5 interior photograph at f/1.4, medium shot of a light pink faux fur throw blanket draped at the foot of a cream linen bed, blush and terracotta pillows visible in background, warm natural side lighting, cozy bedroom interior, 35mm film grain",
    "new-neutrals-4.jpg": "Canon EOS R5 interior photograph at f/1.4, wide shot of a dusty pink oversized throw blanket folded at end of bed, layered pillows in blush and terracotta, warm morning haze, cinematic bedroom photography, 35mm film grain",
    "new-neutrals-5.jpg": "Canon EOS R5 interior photograph at f/1.4, medium shot of a blush matte ceramic vase with dried pampas grass on a wooden nightstand, warm golden lighting casting long shadows, cozy bedroom detail shot, 35mm film grain, cinematic interior photography"
}

os.makedirs(IMG_DIR, exist_ok=True)

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

for filename, prompt in prompts.items():
    print(f"Generating {filename}...", flush=True)
    
    resp = requests.post(
        "https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions",
        headers=headers,
        json={
            "input": {
                "prompt": prompt,
                "width": 960,
                "height": 1440,
                "num_outputs": 1
            }
        }
    )
    data = resp.json()
    
    if "id" not in data:
        print(f"  FAILED: {json.dumps(data)}", flush=True)
        continue
    
    pid = data["id"]
    status = data
    
    while status["status"] not in ("succeeded", "failed"):
        time.sleep(5)
        sid = status["id"]
        r = requests.get(f"https://api.replicate.com/v1/predictions/{sid}", headers=headers)
        status = r.json()
        print(f"  Status: {status['status']}", flush=True)
    
    if status["status"] == "succeeded":
        url = status["output"][0] if isinstance(status["output"], list) else status["output"]
        img_resp = requests.get(url)
        img = Image.open(io.BytesIO(img_resp.content))
        
        # Always crop to 2:3 (672x1008) from center
        w, h = img.size
        target_w, target_h = 672, 1008
        left = (w - target_w) // 2
        top = (h - target_h) // 2
        cropped = img.crop((left, top, left + target_w, top + target_h))
        
        path = os.path.join(IMG_DIR, filename)
        cropped.save(path, quality=95)
        
        # Also save pin version
        pin_name = filename.replace('.jpg', '-pin.jpg')
        pin_path = os.path.join(IMG_DIR, pin_name)
        cropped.save(pin_path, quality=95)
        
        print(f"  DONE: {filename} -> {cropped.size[0]}x{cropped.size[1]}", flush=True)
    else:
        print(f"  FAILED: {status.get('error', 'unknown')}", flush=True)

print("\nALL DONE!")