"""
=============================================================================
This file is the main server connecting the AI, the camera, and 
the game. It constantly records video from the camera, feeds it to the AI model 
to guess the hand gesture, and makes those recognetions available for the game to 
read in real-time. It also provides commands to turn the camera on and off.
=============================================================================
"""
# Import the necessary libraries for the server, AI model, and camera
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
# Create the web server
app = FastAPI()
# Allow the game to communicate with this server without security blocks
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
"""
-----------------------------------------------------------------------------
1. Model Setup
This section loads the pre-trained AI model from your saved file. It changes 
the final layer to output only 2 classes (Palm and Fist) and defines the rules 
for how the camera images should be resized and recolored before the AI sees them.
-----------------------------------------------------------------------------
"""
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

"""
-----------------------------------------------------------------------------
2. Camera Control Variables
This sets up the camera connection. It creates a flag to know if the camera 
is running, and a dictionary to store the AI's most recent guess.
-----------------------------------------------------------------------------
"""
# ------------------ CAMERA CONTROL ------------------

cap = cv2.VideoCapture(1)

camera_running = False   # ⭐⭐⭐⭐⭐⭐
# This stores the latest AI decision so the game can ask for it anytime
latest_prediction = {
    "gesture": "NoHand",
    "confidence": 0.0
}
"""
-----------------------------------------------------------------------------
3. Camera Loop (Background Task)
This function runs constantly in the background. If the camera is on, it grabs 
a picture, gives it to the AI, and saves the AI's guess. If the AI's confidence 
is lower than 80%, it forces the guess to "NoHand" to avoid wrong moves.
-----------------------------------------------------------------------------
"""
# ------------------ CAMERA LOOP ------------------

def camera_loop():
    global latest_prediction, camera_running

    while True:

        #  إذا الكاميرا مو شغالة لا تسوي شيء
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
        
       
# Start the camera loop in the background so it doesn't freeze the server
threading.Thread(target=camera_loop, daemon=True).start()
"""
-----------------------------------------------------------------------------
4. API Routes (Communication Channels)
These are the specific links the game uses to talk to the server. 
- gesture gives the game the latest AI gesture recognition result.
- start turns the camera on.
- stop completely shuts the camera down and frees it.
-----------------------------------------------------------------------------
"""

# ------------------ API ROUTES ------------------

@app.get("/gesture")
def get_gesture():
    return JSONResponse(latest_prediction)
    

#  تشغيل الكاميرا
@app.get("/start")
def start_camera():
    global cap, camera_running
    
    #  إذا كانت الكاميرا تعمل فعلياً، لا تفعل شيئاً
    if camera_running and cap is not None and cap.isOpened():
        return {"status": "camera already running"}
    
    #  إعادة تهيئة الكاميرا
    cap = cv2.VideoCapture(1) 
    
    if not cap.isOpened():
        return {"status": "error", "message": "Could not open video device"}
    
    camera_running = True
    
    return {"status": "camera started and initialized"}

# إيقاف الكاميرا
@app.get("/stop")
def stop_camera():
    global camera_running, cap
    camera_running = False
    
    if cap is not None:
        cap.release()    # هذا السطر الذي يطفئ الكاميرا فعلياً
        cap = None       # إعادة التعيين لضمان إمكانية فتحها مرة أخرى لاحقاً
        cv2.destroyAllWindows() # إغلاق أي نافذة عرض من OpenCV
        
    print("Camera has been released successfully")
    return {"status": "camera stopped"}
"""
-----------------------------------------------------------------------------
5. Video Stream
This section allows the game to display the live video feed on the screen. 
It takes the frames from the camera, converts them into pictures (jpegs), 
and streams them to the webpage.
-----------------------------------------------------------------------------
"""
# ------------------ VIDEO STREAM ------------------

def generate_frames():
    while True:

        #  إذا الكاميرا مو شغالة لا تبث
        if not camera_running:
            time.sleep(0.1)
            continue
        # Grab a picture
        ret, frame = cap.read()
        if not ret:
            continue
        # Convert the picture to JPEG format to send over the internet
        _, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()

        yield (
            b'--frame\r\n'
            b'Content-Type: image/jpeg\r\n\r\n' +
            frame_bytes +
            b'\r\n'
        )
    # The game uses this link to display the camera video in HTML
@app.get("/video")
def video_feed():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )