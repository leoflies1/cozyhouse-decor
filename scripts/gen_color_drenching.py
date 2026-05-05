import requests
import json
import time
import sys
import os

REPLICATE_TOKEN = "r8_FZhZE20dEhcBJS4Pz7pxh1eMFpiF5YD3ThUwb"
IMG_DIR = "public/images/blog"

prompts = {
    "color-drenching-hero.jpg": "Canon EOS R5 photograph at f/1.4, wide angle shot of a moody color-drenched living room in sage green, the same green tone repeats on curtains pillows throw blanket and rug, layered textures velvet linen and chunky knit, warm golden afternoon light streaming through sheer curtains, 35mm film grain, cinematic color grading, earthy and atmospheric, palette of sage green cream warm amber and charcoal",
    "color-drenching-1.jpg": "Canon EOS R5 photograph at f/1.4, medium shot of sage green linen curtains pooling on a wooden floor, afternoon sunlight filtering through creating warm shadows, textured fabric visible, moody cinematic home decor photography, 35mm film grain, natural lighting",
    "color-drenching-2.jpg": "Canon EOS R5 photograph at f/1.4, overhead flat lay of sage green velvet pillows stacked on a cream linen sofa, zigzag texture visible, warm golden hour light from side, layered pillows in different green tones, 35mm film grain, cozy moody interior photography",
    "color-drenching-3.jpg": "Canon EOS R5 photograph at f/1.4, close up of a chunky knit sage green throw blanket draped over the arm of a beige linen sofa, textured knit visible, warm natural side lighting, cozy home decor photography, 35mm film grain",
    "color-drenching-4.jpg": "Canon EOS R5 photograph at f/1.4, wide shot of a sage and ivory patterned rug under a wooden coffee table, green walls in background, cozy living room with layered textures, warm afternoon haze, cinematic home decor photography, 35mm film grain",
    "color-drenching-5.jpg": "Canon EOS R5 photograph at f/1.4, medium shot of a ceramic sage green vase with dried eucalyptus on a wooden coffee table, warm golden lighting casting long shadows, cozy home decor detail shot, 35mm film grain, cinematic interior photography",
}

def gen_image(prompt, filename):
    print(f"Generating {filename}...", flush=True)
    
    resp = requests.post(
                "https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions",
        headers={
            "Authorization": f"Bearer {REPLICATE_TOKEN}",
            "Content-Type": "application/json"
        },
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
        return False
    
    prediction_id = data["id"]
    status = data
    
    while status["status"] not in ("succeeded", "failed"):
        time.sleep(5)
        r = requests.get(
            f"https://api.replicate.com/v1/predictions/{prediction_id}",
            headers={"Authorization": f"Bearer {REPLICATE_TOKEN}"}
        )
        status = r.json()
        print(f"  Status: {status['status']}", flush=True)
    
    if status["status"] == "succeeded":
        url = status["output"][0] if isinstance(status["output"], list) else status["output"]
        img_resp = requests.get(url)
        path = os.path.join(IMG_DIR, filename)
        with open(path, "wb") as f:
            f.write(img_resp.content)
        print(f"  DONE: {path} ({len(img_resp.content)} bytes)", flush=True)
        return True
    else:
        print(f"  FAILED: {status.get('error', 'unknown')}", flush=True)
        return False

os.makedirs(IMG_DIR, exist_ok=True)

for file, prompt in prompts.items():
    gen_image(prompt, file)

print("\nALL DONE!")