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

#  (2 trained classes)
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

# ------------------ CAMERA ------------------

cap = cv2.VideoCapture(0)

latest_prediction = {
    "gesture": "NoHand",
    "confidence": 0.0
}

def camera_loop():
    global latest_prediction

    while True:
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

def generate_frames():
    while True:
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