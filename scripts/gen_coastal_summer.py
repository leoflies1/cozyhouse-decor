import requests, json, time, sys, os, io
from PIL import Image

TOKEN = "r8_FZhZE20dEhcBJS4Pz7pxh1eMFpiF5YD3ThUwb"
IMG_DIR = "public/images/blog"

os.makedirs(IMG_DIR, exist_ok=True)

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# Coastal Summer - Navy + Natural theme
prompts = {
    # Hero: Wide living room shot with coastal summer palette
    "summer-coastal-hero.jpg": "Canon EOS R5 interior photograph f/2.0, wide angle shot of a coastal summer living room with navy blue throw pillows on a cream linen sofa, natural seagrass jute rug on warm wooden floor, white sheer curtains filtering afternoon sun, rattan basket filled with cream throw blankets in corner, coastal wall art set on wall behind sofa, ceramic vase with dried eucalyptus on coffee table, warm golden hour light streaming through windows, navy and cream and natural tones palette, editorial interior photography, 35mm film grain, cinematic lighting, warm atmosphere, home decor magazine style",
    # Section 1: Jute/seagrass rug on wooden floor
    "summer-coastal-1.jpg": "Canon EOS R5 interior photograph f/1.8, low angle shot of a natural seagrass jute braided area rug on warm oak hardwood floor, a cream linen sofa edge visible, morning sunlight casting shadow patterns on the rug texture, coastal summer aesthetic, navy blue accent visible in background, natural fiber texture close up, warm golden light, editorial photography, 35mm film grain",
    # Section 2: Navy blue linen throw pillows on cream sofa
    "summer-coastal-2.jpg": "Canon EOS R5 interior photograph f/1.8, close up of two navy blue linen throw pillow covers with subtle texture on a cream linen sofa, soft afternoon sunlight highlighting the fabric weave, coral and white accent pillow next to them, coastal summer decor, relaxed casual styling, editorial home photography, 35mm film grain, warm tones",
    # Section 3: Sheer curtains in coastal room
    "summer-coastal-3.jpg": "Canon EOS R5 interior photograph f/1.8, medium shot of white cream linen curtain panels gently billowing in summer breeze by a bright window, warm afternoon light filtering through sheer fabric, casting soft shadows on floor, navy blue vase on windowsill, coastal summer atmosphere, airy and fresh, editorial interior photography, 35mm film grain",
    # Section 4: Woven rattan basket with throws
    "summer-coastal-4.jpg": "Canon EOS R5 interior photograph f/1.8, medium shot of a large woven round storage basket with lid made of seagrass and banana fiber filled with cream colored chunky knit throw blankets, natural texture up close, soft side lighting, cozy corner of coastal living room, navy blue accent wall visible, editorial interior photography, 35mm film grain, warm summer vibe",
    # Section 5: Coastal wall art on wall
    "summer-coastal-5.jpg": "Canon EOS R5 interior photograph f/1.8, medium shot of a set of three coastal themed framed wall art prints botanical style with navy and cream tones, hanging above a cream console table with ceramic vase and small decorative items, soft ambient lighting, coastal grandmother aesthetic, editorial interior photography, 35mm film grain",
    # Section 6: Ceramic vase set with dried florals
    "summer-coastal-6.jpg": "Canon EOS R5 interior photograph f/1.8, close up of white and navy blue ceramic vase set on a wood coffee table with dried eucalyptus stems and pampas grass, textured ceramic glaze, soft golden hour light creating warm shadows, coastal summer table styling, editorial interior photography, 35mm film grain"
}

# Generate hero first (different model for 1200x800 blog hero)
print("Generating hero image (summer-coastal-hero.jpg)...", flush=True)
resp = requests.post(
    "https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions",
    headers=headers,
    json={
        "input": {
            "prompt": prompts["summer-coastal-hero.jpg"],
            "width": 1200,
            "height": 800,
            "num_outputs": 1,
            "output_format": "jpg",
            "output_quality": 85
        }
    }
)
data = resp.json()
if "id" in data:
    pid = data["id"]
    status_data = data
    while status_data["status"] not in ("succeeded", "failed"):
        time.sleep(5)
        r = requests.get(f"https://api.replicate.com/v1/predictions/{status_data['id']}", headers=headers)
        status_data = r.json()
        print(f"  Status: {status_data['status']}", flush=True)
    
    if status_data["status"] == "succeeded":
        url = status_data["output"][0] if isinstance(status_data["output"], list) else status_data["output"]
        img_resp = requests.get(url)
        img = Image.open(io.BytesIO(img_resp.content))
        img.save(os.path.join(IMG_DIR, "summer-coastal-hero.jpg"), quality=85)
        print(f"  Saved summer-coastal-hero.jpg ({img.size})", flush=True)
    else:
        print(f"  FAILED: {status_data.get('error', 'unknown')}", flush=True)
else:
    print(f"  FAILED: {json.dumps(data)}", flush=True)

# Generate section images (1200x800 for blog)
for i in range(1, 7):
    fname = f"summer-coastal-{i}.jpg"
    print(f"Generating {fname}...", flush=True)
    
    resp = requests.post(
        "https://api.replicate.com/v1/models/black-forest-labs/flux-2-pro/predictions",
        headers=headers,
        json={
            "input": {
                "prompt": prompts[fname],
                "width": 1200,
                "height": 800,
                "num_outputs": 1,
                "output_format": "jpg",
                "output_quality": 85
            }
        }
    )
    data = resp.json()
    
    if "id" not in data:
        print(f"  FAILED: {json.dumps(data)}", flush=True)
        continue
    
    pid = data["id"]
    status_data = data
    while status_data["status"] not in ("succeeded", "failed"):
        time.sleep(5)
        r = requests.get(f"https://api.replicate.com/v1/predictions/{status_data['id']}", headers=headers)
        status_data = r.json()
        print(f"  Status: {status_data['status']}", flush=True)
    
    if status_data["status"] == "succeeded":
        url = status_data["output"][0] if isinstance(status_data["output"], list) else status_data["output"]
        img_resp = requests.get(url)
        img = Image.open(io.BytesIO(img_resp.content))
        img.save(os.path.join(IMG_DIR, fname), quality=85)
        print(f"  Saved {fname} ({img.size})", flush=True)
    else:
        print(f"  FAILED: {status_data.get('error', 'unknown')}", flush=True)

print("DONE - All images generated!", flush=True)