# Get the original game repositry: git clone https://github.com/pablogozalvez/Super-Mario-Phaser
# change the game.js file with the one inside the game file
# install requirments for backend :pip install fastapi uvicorn opencv-python mediapipe pillow torch torchvision
# interminal run : uvicorn backend_api:app --reload or python -m uvicorn backend_api:app --reload
# will open on http://localhost:5500
# in the game folder open an integrated terminaal and run Uvicorn running on http://127.0.0.1:8000 then python -m http.server 5500 
# will open on http://127.0.0.1:8000

from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import torch
import torch.nn as nn
from torchvision import models, transforms
import cv2
from PIL import Image
import threading
import time

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------ MODEL ------------------

model = models.resnet18(pretrained=False)

model.fc = nn.Sequential(
    nn.Linear(model.fc.in_features, 256),
    nn.ReLU(),
    nn.Dropout(0.4),
    nn.Linear(256, 2)
)

model.load_state_dict(torch.load("best_model.pth", map_location="cpu"))
model.eval()

class_names = ["Open", "Close"]

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# ------------------ CAMERA CONTROL ------------------

cap = cv2.VideoCapture(0)

camera_running = False   # ⭐⭐⭐⭐⭐⭐

latest_prediction = {
    "gesture": "NoHand",
    "confidence": 0.0
}

# ------------------ CAMERA LOOP ------------------

def camera_loop():
    global latest_prediction, camera_running

    while True:

        # ⭐⭐⭐⭐⭐⭐ إذا الكاميرا مو شغالة لا تسوي شيء
        if not camera_running:
            time.sleep(0.1)
            continue

        ret, frame = cap.read()
        if not ret:
            continue

        frame = cv2.flip(frame, 1)
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        image = Image.fromarray(frame_rgb)

        input_tensor = transform(image).unsqueeze(0)

        with torch.no_grad():
            outputs = model(input_tensor)
            probs = torch.nn.functional.softmax(outputs, dim=1)
            confidence, predicted = torch.max(probs, 1)

        conf = float(confidence.item())
        gesture = class_names[predicted.item()]

        if conf < 0.80:
            gesture = "NoHand"

        latest_prediction["gesture"] = gesture
        latest_prediction["confidence"] = conf

        time.sleep(0.05)

threading.Thread(target=camera_loop, daemon=True).start()

# ------------------ API ROUTES ------------------

@app.get("/gesture")
def get_gesture():
    return JSONResponse(latest_prediction)

# ⭐⭐⭐⭐⭐⭐ تشغيل الكاميرا
@app.get("/start")
def start_camera():
    global cap, camera_running
    
    # ⭐⭐⭐⭐⭐⭐ إذا كانت الكاميرا تعمل فعلياً، لا تفعل شيئاً
    if camera_running and cap is not None and cap.isOpened():
        return {"status": "camera already running"}
    
    # ⭐⭐⭐⭐⭐⭐ إعادة تهيئة الكاميرا
    cap = cv2.VideoCapture(0) 
    
    if not cap.isOpened():
        return {"status": "error", "message": "Could not open video device"}
    
    camera_running = True
    
    return {"status": "camera started and initialized"}

# ⭐⭐⭐⭐⭐⭐ إيقاف الكاميرا
@app.get("/stop")
def stop_camera():
    global camera_running, cap
    camera_running = False
    
    if cap is not None:
        cap.release()    # ⭐⭐⭐⭐⭐⭐ هذا السطر الذي يطفئ الكاميرا فعلياً
        cap = None       # إعادة التعيين لضمان إمكانية فتحها مرة أخرى لاحقاً
        cv2.destroyAllWindows() # إغلاق أي نافذة عرض من OpenCV
        
    print("Camera has been released successfully")
    return {"status": "camera stopped"}

# ------------------ VIDEO STREAM ------------------

def generate_frames():
    while True:

        # ⭐⭐⭐⭐⭐⭐ إذا الكاميرا مو شغالة لا تبث
        if not camera_running:
            time.sleep(0.1)
            continue

        ret, frame = cap.read()
        if not ret:
            continue

        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' +
            frame_bytes +
            b'\r\n'
        )

@app.get("/video")
def video_feed():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )